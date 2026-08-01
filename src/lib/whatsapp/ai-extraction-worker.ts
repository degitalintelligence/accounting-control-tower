import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTasksFromMessage } from "@/lib/ai/openrouter-client";
import { resolveParticipant, resolveProfileName } from "@/lib/whatsapp/identity";
import { parseExplicitCommand, parseExplicitWorkItemCommand, explicitCommandHelp } from "@/lib/whatsapp/commands";
import { canTransition, getTransition } from "@/lib/work-engine/status-machine";
import type { AssignmentRole, WorkItemStatus } from "@/types/work-item";

type WorkerClient = Pick<SupabaseClient, "from" | "rpc">;

type JobRow = {
  id: string;
  domain_event_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
  organization_id: string;
  claimed_by: string | null;
  claim_token: string | null;
};

type MessageContext = {
  id: string;
  content: string | null;
  organization_id: string;
  wa_group_id: string;
  sender_participant_id: string | null;
};

const batchSize = 10;
const promptVersion = "task-extraction-v1";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Kesalahan tidak diketahui.";
}

async function claimNext(admin: WorkerClient, workerId: string, eventType: string): Promise<JobRow | null> {
  const result = await admin.rpc("claim_outbox_event" as never, {
    p_worker_id: workerId,
    p_event_type: eventType,
    p_lease_seconds: 600,
  });
  const claimed = result as unknown as { data: JobRow[] | null; error: { message: string } | null };
  if (claimed.error) throw new Error(claimed.error.message);
  return claimed.data?.[0] ?? null;
}

async function markCompleted(admin: WorkerClient, id: string, workerId: string) {
  const result = await admin
    .from("outbox_events")
    .update({ status: "processed", processed_at: new Date().toISOString(), next_retry_at: null, lease_expires_at: null, claimed_at: null, claimed_by: null, claim_token: null })
    .eq("id", id)
    .eq("status", "processing")
    .eq("claimed_by", workerId);
  const update = result as unknown as { error: { message: string } | null };
  if (update.error) throw new Error(update.error.message);
}

async function markFailed(admin: WorkerClient, row: JobRow, workerId: string, error: unknown) {
  const result = await admin.rpc("fail_outbox_event" as never, {
    p_outbox_event_id: row.id,
    p_error_message: errorMessage(error),
    p_worker_id: workerId,
  });
  const update = result as unknown as { error: { message: string } | null };
  if (update.error) throw new Error(update.error.message);
}

async function loadMessage(admin: WorkerClient, messageId: string, organizationId: string): Promise<MessageContext> {
  const result = await admin
    .from("wa_messages")
    .select("id, content, wa_group_id, sender_participant_id, wa_groups!inner(organization_id)")
    .eq("id", messageId)
    .eq("wa_groups.organization_id", organizationId)
    .maybeSingle();
  const loaded = result as unknown as {
    data: { id: string; content: string | null; wa_group_id: string; sender_participant_id: string | null; wa_groups: { organization_id: string } | null } | null;
    error: { message: string } | null;
  };
  if (loaded.error) throw new Error(loaded.error.message);
  if (!loaded.data || loaded.data.wa_groups?.organization_id !== organizationId) {
    throw new Error("Pesan WhatsApp tidak ditemukan dalam tenant yang sesuai.");
  }
  return { id: loaded.data.id, content: loaded.data.content, organization_id: organizationId, wa_group_id: loaded.data.wa_group_id, sender_participant_id: loaded.data.sender_participant_id };
}

async function processJob(admin: WorkerClient, row: JobRow) {
  if (row.event_type !== "ai_extraction_requested") return;
  const messageId = typeof row.payload.message_id === "string" ? row.payload.message_id : null;
  const organizationId = typeof row.payload.organization_id === "string" ? row.payload.organization_id : null;
  if (!messageId || !organizationId) throw new Error("Payload job AI extraction tidak lengkap.");

  const message = await loadMessage(admin, messageId, organizationId);
  const existingResult = await admin.from("ai_extraction_runs").select("id, status").eq("wa_message_id", message.id).maybeSingle();
  const existing = existingResult as unknown as { data: { id: string; status: string } | null; error: { message: string } | null };
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.status === "completed") return;

  let runId = existing.data?.id;
  if (!runId) {
    const runResult = await admin.from("ai_extraction_runs").insert({
      wa_message_id: message.id,
      model: process.env.OPENROUTER_MODEL ?? null,
      prompt_version: promptVersion,
      status: "processing",
    }).select("id").single();
    const run = runResult as unknown as { data: { id: string } | null; error: { code?: string; message: string } | null };
    if (run.error && run.error.code !== "23505") throw new Error(run.error.message);
    if (run.error) {
      const retryResult = await admin.from("ai_extraction_runs").select("id, status").eq("wa_message_id", message.id).single();
      const retry = retryResult as unknown as { data: { id: string; status: string } | null; error: { message: string } | null };
      if (retry.error || !retry.data) throw new Error(retry.error?.message ?? "Extraction run tidak ditemukan.");
      if (retry.data.status === "completed") return;
      runId = retry.data.id;
    } else {
      runId = run.data?.id;
    }
  }
  if (!runId) throw new Error("Extraction run tidak dapat dibuat.");

  try {
    const extraction = await extractTasksFromMessage(message.content ?? "");
    const extractionRunResult = await admin.from("ai_extraction_runs").update({
      model: process.env.OPENROUTER_MODEL ?? null,
      prompt_version: promptVersion,
      extracted_fields: extraction,
      classification: extraction.classification,
      confidence: extraction.tasks.length ? Math.max(...extraction.tasks.map((task) => task.confidence)) : null,
      processing_time_ms: null,
      status: "completed",
      error_message: null,
    }).eq("id", runId);
    const extractionRun = extractionRunResult as unknown as { error: { message: string } | null };
    if (extractionRun.error) throw new Error(extractionRun.error.message);

    for (const task of extraction.tasks) {
      const maker = task.maker_name ? await resolveProfileName(admin, message.wa_group_id, task.maker_name) : null;
      const checker = task.checker_name ? await resolveProfileName(admin, message.wa_group_id, task.checker_name) : null;
      const clientResult = task.client_name ? await admin.from("clients").select("id").eq("organization_id", message.organization_id).is("deleted_at", null).ilike("name", task.client_name).maybeSingle() : null;
      const client = clientResult as unknown as { data: { id: string } | null; error: { message: string } | null } | null;
      const suggestionResult = await admin.from("action_suggestions").upsert({
        organization_id: message.organization_id,
        extraction_run_id: runId,
        source_type: "whatsapp_ai",
        source_reference_id: message.id,
        source_metadata: { classification: extraction.classification, source_context: task.source_context, reasons: task.reasons, identity_resolution: { sender_participant_id: message.sender_participant_id, maker_status: maker?.status ?? "not_requested", checker_status: checker?.status ?? "not_requested", client_status: client?.data ? "resolved" : task.client_name ? "unresolved" : "not_requested" } },
        suggested_title: task.title,
        suggested_description: task.source_context || null,
        suggested_due_at: task.due_date ? `${task.due_date}T00:00:00.000Z` : null,
        confidence: task.confidence,
        suggested_maker_id: maker?.status === "resolved" ? maker.profileId : null,
        suggested_checker_id: checker?.status === "resolved" && checker.profileId !== maker?.profileId ? checker.profileId : null,
        suggested_client_id: client?.data?.id ?? null,
        status: "pending",
      }, { onConflict: "extraction_run_id,suggested_title", ignoreDuplicates: true });
      const suggestion = suggestionResult as unknown as { error: { code?: string; message: string } | null };
      if (suggestion.error) throw new Error(suggestion.error.message);
    }
  } catch (error) {
    await admin.from("ai_extraction_runs").update({ status: "failed", error_message: errorMessage(error) }).eq("id", runId);
    throw error;
  }
}

async function enqueueReply(admin: WorkerClient, organizationId: string, messageId: string, chatId: string, text: string) {
  const result = await admin.rpc("enqueue_whatsapp_reply" as never, {
    p_organization_id: organizationId,
    p_message_id: messageId,
    p_chat_id: chatId,
    p_text: text,
  } as never);
  const response = result as unknown as { error: { message: string } | null };
  if (response.error) throw new Error(response.error.message);
}

async function enqueueAiExtraction(admin: WorkerClient, organizationId: string, messageId: string) {
  const domainResult = await admin.from("domain_events").insert({
    organization_id: organizationId,
    event_type: "ai_extraction_requested",
    aggregate_type: "wa_message",
    aggregate_id: messageId,
    payload: { message_id: messageId, organization_id: organizationId },
  } as never).select("id").maybeSingle();
  const domain = domainResult as unknown as { data: { id: string } | null; error: { code?: string; message: string } | null };
  if (domain.error && domain.error.code !== "23505") throw new Error(domain.error.message);
  if (!domain.data) return;
  const outboxResult = await admin.from("outbox_events").insert({ organization_id: organizationId, domain_event_id: domain.data.id, event_type: "ai_extraction_requested", payload: { message_id: messageId, organization_id: organizationId }, max_retries: 5 } as never);
  const outbox = outboxResult as unknown as { error: { message: string } | null };
  if (outbox.error) throw new Error(outbox.error.message);
}

async function processReceivedMessage(admin: WorkerClient, row: JobRow) {
  const messageId = typeof row.payload.message_id === "string" ? row.payload.message_id : null;
  if (!messageId) throw new Error("Payload pesan WhatsApp tidak lengkap.");
  const message = await loadMessage(admin, messageId, row.organization_id);
  const chatResult = await admin.from("wa_groups").select("provider_group_id").eq("id", message.wa_group_id).maybeSingle();
  const chat = chatResult as unknown as { data: { provider_group_id: string } | null; error: { message: string } | null };
  if (chat.error || !chat.data) throw new Error(chat.error?.message ?? "Grup WhatsApp tidak ditemukan.");
  const content = message.content;
  const command = parseExplicitCommand(content);
  const workItemCommand = parseExplicitWorkItemCommand(content);
  if (content?.trim().startsWith("/task") && !command) {
    await enqueueReply(admin, row.organization_id, message.id, chat.data.provider_group_id, explicitCommandHelp());
    return;
  }
  if (command) {
    const sender = await resolveParticipant(admin, message.wa_group_id, message.sender_participant_id);
    const maker = command.makerParticipantId ? await resolveProfileName(admin, message.wa_group_id, command.makerParticipantId) : sender;
    const checker = command.checkerParticipantId ? await resolveProfileName(admin, message.wa_group_id, command.checkerParticipantId) : null;
    if (sender.status !== "resolved" || !sender.profileId || maker.status !== "resolved" || !maker.profileId || (checker && (checker.status !== "resolved" || !checker.profileId)) || maker.profileId === checker?.profileId) {
      await enqueueReply(admin, row.organization_id, message.id, chat.data.provider_group_id, "Identitas WhatsApp belum terverifikasi atau maker/checker konflik.");
      return;
    }
    const clientResult = await admin.from("clients").select("id").eq("organization_id", row.organization_id).is("deleted_at", null).or(`slug.eq.${command.clientRef},name.ilike.${command.clientRef}`).maybeSingle();
    const client = clientResult as unknown as { data: { id: string } | null; error: { message: string } | null };
    if (client.error || !client.data) {
      await enqueueReply(admin, row.organization_id, message.id, chat.data.provider_group_id, "Client tidak ditemukan di organisasi ini.");
      return;
    }
    const workItemResult = await admin.rpc("create_whatsapp_command_work_item" as never, { p_organization_id: row.organization_id, p_client_id: client.data.id, p_title: command.title, p_due_at: command.dueAt, p_source_reference_id: message.id, p_source_metadata: { provider: "waha", creation_mode: "explicit_command", sender_profile_id: sender.profileId, maker_profile_id: maker.profileId, checker_profile_id: checker?.profileId ?? null }, p_created_by: sender.profileId, p_maker_id: maker.profileId, p_checker_id: checker?.profileId ?? null } as never);
    const workItem = workItemResult as unknown as { data: { id: string; title: string } | null; error: { message: string } | null };
    if (workItem.error || !workItem.data) throw new Error(workItem.error?.message ?? "Task gagal dibuat.");
    await enqueueReply(admin, row.organization_id, message.id, chat.data.provider_group_id, `Task dibuat: ${workItem.data.title}`);
    return;
  }
  if (content?.trim().startsWith("/update") || content?.trim().startsWith("/submit") || content?.trim().startsWith("/status")) {
    if (!workItemCommand) {
      await enqueueReply(admin, row.organization_id, message.id, chat.data.provider_group_id, explicitCommandHelp());
      return;
    }
    const sender = await resolveProfileName(admin, message.wa_group_id, message.sender_participant_id ?? "");
    if (sender.status !== "resolved" || !sender.profileId) {
      await enqueueReply(admin, row.organization_id, message.id, chat.data.provider_group_id, "Identitas WhatsApp belum terverifikasi.");
      return;
    }
    const itemResult = await admin.from("work_items").select("id, status, title").eq("id", workItemCommand.workItemId).eq("organization_id", row.organization_id).is("deleted_at", null).maybeSingle();
    const item = itemResult as unknown as { data: { id: string; status: string; title: string } | null; error: { message: string } | null };
    if (item.error || !item.data) {
      await enqueueReply(admin, row.organization_id, message.id, chat.data.provider_group_id, "Work item tidak ditemukan pada organisasi ini.");
      return;
    }
    if (workItemCommand.action === "status") {
      await enqueueReply(admin, row.organization_id, message.id, chat.data.provider_group_id, `${item.data.title}: ${item.data.status}`);
      return;
    }
    const assignmentsResult = await admin.from("assignments").select("role").eq("work_item_id", item.data.id).eq("profile_id", sender.profileId).is("unassigned_at", null);
    const assignments = assignmentsResult as unknown as { data: { role: string }[] | null; error: { message: string } | null };
    const toStatus = workItemCommand.action === "submit" ? "submitted" : workItemCommand.status as WorkItemStatus | null;
    if (assignments.error || !assignments.data?.some((assignment) => toStatus && getTransition(item.data!.status as WorkItemStatus, toStatus) && canTransition(item.data!.status as WorkItemStatus, toStatus, assignment.role as AssignmentRole))) {
      await enqueueReply(admin, row.organization_id, message.id, chat.data.provider_group_id, "Transisi atau status tidak diizinkan untuk role Anda.");
      return;
    }
    const transitionResult = await admin.rpc("transition_work_item" as never, { p_work_item_id: item.data.id, p_to_status: toStatus, p_actor_id: sender.profileId, p_reason: workItemCommand.reason } as never);
    const transition = transitionResult as unknown as { error: { message: string } | null };
    if (transition.error) throw new Error(transition.error.message);
    await enqueueReply(admin, row.organization_id, message.id, chat.data.provider_group_id, `Work item diperbarui: ${toStatus}`);
    return;
  }
  await enqueueAiExtraction(admin, row.organization_id, message.id);
}

async function processReply(admin: WorkerClient, row: JobRow) {
  const chatId = typeof row.payload.chat_id === "string" ? row.payload.chat_id : null;
  const text = typeof row.payload.text === "string" ? row.payload.text : null;
  if (!chatId || !text) throw new Error("Payload reply WhatsApp tidak lengkap.");
  const { sendWahaText } = await import("@/lib/whatsapp/adapter");
  await sendWahaText(chatId, text);
}

export async function runAiExtractionWorker(admin: WorkerClient) {
  const workerId = `ai-extraction-${crypto.randomUUID()}`;
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin, workerId, "ai_extraction_requested");
    if (!row) break;
    try {
      await processJob(admin, row);
      await markCompleted(admin, row.id, workerId);
      processed += 1;
    } catch (error) {
      await markFailed(admin, row, workerId, error);
      failed += 1;
      console.error("[ai-extraction-worker] Pemrosesan gagal:", { outboxId: row.id, message: errorMessage(error) });
    }
  }
  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin, workerId, "whatsapp_message_received");
    if (!row) break;
    try {
      await processReceivedMessage(admin, row);
      await markCompleted(admin, row.id, workerId);
      processed += 1;
    } catch (error) {
      await markFailed(admin, row, workerId, error);
      failed += 1;
      console.error("[ai-extraction-worker] Pemrosesan gagal:", { outboxId: row.id, message: errorMessage(error) });
    }
  }
  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin, workerId, "whatsapp_reply_requested");
    if (!row) break;
    try {
      await processReply(admin, row);
      await markCompleted(admin, row.id, workerId);
      processed += 1;
    } catch (error) {
      await markFailed(admin, row, workerId, error);
      failed += 1;
      console.error("[ai-extraction-worker] Pemrosesan gagal:", { outboxId: row.id, message: errorMessage(error) });
    }
  }
  return { processed, failed };
}
