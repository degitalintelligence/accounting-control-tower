import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTasksFromMessage, generateWhatsAppSummary, OpenRouterError } from "@/lib/ai/openrouter-client";
import { resolveParticipant, resolveProfileName } from "@/lib/whatsapp/identity";
import { parseExplicitCommand, parseExplicitWorkItemCommand, explicitCommandHelp } from "@/lib/whatsapp/commands";
import { canTransition, getTransition } from "@/lib/work-engine/status-machine";
import type { AssignmentRole, WorkItemStatus } from "@/types/work-item";
import { createWhatsAppSessionAdapter } from "@/lib/whatsapp/adapter";

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
  connection_id: string;
  session_id: string;
  provider: string;
  chat_id: string;
};

type AiIntake = { id: string; organization_id: string; client_id: string | null; created_by: string; source_text: string; status: string; attempt_count: number };

const batchSize = 10;
const promptVersion = "task-extraction-v1";

function errorMessage(error: unknown): string {
  if (error instanceof OpenRouterError) {
    return `${error.code}${error.status ? ` (HTTP ${error.status})` : ""}: ${error.message}`.slice(0, 500);
  }
  if (error instanceof Error) {
    return error.message
      .replace(/Bearer\s+[\w.+\-/_=]+/gi, "Bearer [REDACTED]")
      .replace(/https?:\/\/[^\s]+/gi, "[URL REDACTED]")
      .slice(0, 500);
  }
  return "Kesalahan tidak diketahui.";
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

async function markCompleted(admin: WorkerClient, row: JobRow, workerId: string) {
  const result = await admin
    .from("outbox_events")
    .update({ status: "processed", processed_at: new Date().toISOString(), next_retry_at: null, lease_expires_at: null, claimed_at: null, claimed_by: null, claim_token: null })
    .eq("id", row.id)
    .eq("status", "processing")
    .eq("claimed_by", workerId)
    .eq("claim_token", row.claim_token);
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
    .select("id, content, wa_group_id, sender_participant_id, wa_groups!inner(organization_id, provider_group_id, connection_id, integration_connections!inner(provider, session_id))")
    .eq("id", messageId)
    .eq("wa_groups.organization_id", organizationId)
    .maybeSingle();
  const loaded = result as unknown as {
    data: { id: string; content: string | null; wa_group_id: string; sender_participant_id: string | null; wa_groups: { organization_id: string; provider_group_id: string; connection_id: string; integration_connections: { provider: string; session_id: string | null } } | null } | null;
    error: { message: string } | null;
  };
  if (loaded.error) throw new Error(loaded.error.message);
  if (!loaded.data || loaded.data.wa_groups?.organization_id !== organizationId) {
    throw new Error("Pesan WhatsApp tidak ditemukan dalam tenant yang sesuai.");
  }
  const group = loaded.data.wa_groups;
  if (!group?.integration_connections.session_id) throw new Error("Sesi WhatsApp inbound tidak tersedia.");
  return { id: loaded.data.id, content: loaded.data.content, organization_id: organizationId, wa_group_id: loaded.data.wa_group_id, sender_participant_id: loaded.data.sender_participant_id, connection_id: group.connection_id, session_id: group.integration_connections.session_id, provider: group.integration_connections.provider, chat_id: group.provider_group_id };
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

async function processAiIntake(admin: WorkerClient, row: JobRow) {
  const intakeId = typeof row.payload.intake_id === "string" ? row.payload.intake_id : null;
  if (!intakeId) throw new Error("Payload AI intake tidak lengkap.");
  const loaded = await admin.from("ai_intake_items").select("id, organization_id, client_id, created_by, source_text, status, attempt_count").eq("id", intakeId).eq("organization_id", row.organization_id).is("deleted_at", null).maybeSingle();
  const intake = loaded as unknown as { data: AiIntake | null; error: { message: string } | null };
  if (intake.error) throw new Error(intake.error.message);
  if (!intake.data || intake.data.status === "draft") return;
  const claimed = await admin.from("ai_intake_items").update({ status: "processing", processing_started_at: new Date().toISOString(), attempt_count: (intake.data.attempt_count ?? 0) + 1, updated_at: new Date().toISOString() } as never).eq("id", intakeId).eq("organization_id", row.organization_id).eq("status", "queued");
  const claimedData = claimed as unknown as { error: { message: string } | null };
  if (claimedData.error) throw new Error(claimedData.error.message);
  try {
    const extraction = await extractTasksFromMessage(intake.data.source_text);
    const rows = extraction.tasks.map((task) => ({ organization_id: row.organization_id, intake_id: intakeId, title: task.title, description: task.source_context, type: task.type, client_id: intake.data?.client_id, maker_name: task.maker_name, due_at: task.due_date ? `${task.due_date}T23:59:59.000Z` : null, source_context: task.source_context, confidence: task.confidence, clarification_needed: !task.maker_name || !intake.data?.client_id, clarification_question: !task.maker_name ? "Siapa PIC/maker untuk pekerjaan ini?" : !intake.data?.client_id ? "Task ini masuk ke client mana?" : null, status: "draft", created_by: intake.data?.created_by }));
    if (rows.length) { const inserted = await admin.from("ai_draft_items").insert(rows as never); const insertedData = inserted as unknown as { error: { message: string } | null }; if (insertedData.error) throw new Error(insertedData.error.message); }
    const updated = await admin.from("ai_intake_items").update({ status: "draft", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq("id", intakeId).eq("status", "processing");
    const updatedData = updated as unknown as { error: { message: string } | null };
    if (updatedData.error) throw new Error(updatedData.error.message);
  } catch (error) {
    const failed = await admin.from("ai_intake_items").update({ status: "failed", failed_at: new Date().toISOString(), error_message: errorMessage(error), updated_at: new Date().toISOString() } as never).eq("id", intakeId).eq("status", "processing");
    const failedData = failed as unknown as { error: { message: string } | null };
    if (failedData.error) throw new Error(failedData.error.message);
    throw error;
  }
}

async function processConversationSummary(admin: WorkerClient, row: JobRow) {
  const groupId = typeof row.payload.wa_group_id === "string" ? row.payload.wa_group_id : null;
  const organizationId = row.organization_id;
  const windowStart = typeof row.payload.window_start === "string" ? row.payload.window_start : null;
  if (!groupId || !windowStart) throw new Error("Payload summary WhatsApp tidak lengkap.");
  const start = new Date(windowStart);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const groupResult = await admin.from("wa_groups").select("id, organization_id, is_active").eq("id", groupId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
  const group = groupResult as unknown as { data: { id: string; organization_id: string; is_active: boolean } | null; error: { message: string } | null };
  if (group.error) throw new Error(group.error.message);
  if (!group.data) throw new Error("Grup WhatsApp tidak ditemukan dalam tenant yang sesuai.");
  const messagesResult = await admin.from("wa_messages").select("id, sender_participant_id, content, message_type, received_at").eq("wa_group_id", groupId).gte("received_at", start.toISOString()).lt("received_at", end.toISOString()).order("received_at", { ascending: true }).limit(200);
  const messages = messagesResult as unknown as { data: { id: string; sender_participant_id: string | null; content: string | null; message_type: string; received_at: string }[] | null; error: { message: string } | null };
  if (messages.error) throw new Error(messages.error.message);
  const rows = messages.data ?? [];
  const participants = [...new Set(rows.map((message) => message.sender_participant_id).filter((value): value is string => Boolean(value)))];
  const deterministicSummary = `${rows.length} pesan dari ${participants.length} pengirim pada jendela 7 hari.`;
  const context = rows.map((message) => `[message_id=${message.id}] [${message.received_at}] ${message.sender_participant_id ?? "unknown"}: ${(message.content ?? `[${message.message_type}]`).slice(0, 500)}`).join("\n");
  const ai = await generateWhatsAppSummary(context);
  const upsert = await admin.from("whatsapp_conversation_summaries").upsert({ organization_id: organizationId, wa_group_id: groupId, window_start: start.toISOString(), window_end: end.toISOString(), message_count: rows.length, participant_count: participants.length, participants, latest_message_at: rows.at(-1)?.received_at ?? null, deterministic_summary: deterministicSummary, ai_summary: ai.summary, ai_action_suggestions: ai.actions.map((action) => ({ ...action, requires_human_review: true })), status: "completed", attempt_count: 1, last_error: null, updated_at: new Date().toISOString() }, { onConflict: "organization_id,wa_group_id,window_start" }).select("id").single();
  const result = upsert as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Ringkasan WhatsApp tidak dapat disimpan.");

  for (const action of ai.actions) {
    const evidenceMessageIds = action.message_ids.filter((messageId) => rows.some((message) => message.id === messageId));
    if (!evidenceMessageIds.length) continue;
    const suggestionResult = await admin.from("action_suggestions").upsert({
      organization_id: organizationId,
      source_summary_id: result.data.id,
      source_type: "whatsapp_ai",
      source_reference_id: result.data.id,
      source_metadata: { provider: "waha", creation_mode: "ai_summary", wa_group_id: groupId, window_start: start.toISOString(), window_end: end.toISOString(), requires_human_review: true, evidence_message_ids: evidenceMessageIds },
      evidence_message_ids: evidenceMessageIds,
      evidence_text: action.evidence,
      suggested_title: action.title,
      suggested_description: action.evidence,
      confidence: action.confidence,
      status: "pending",
    }, { onConflict: "source_summary_id,suggested_title" });
    const suggestion = suggestionResult as unknown as { error: { message: string } | null };
    if (suggestion.error) throw new Error(suggestion.error.message);
  }

  const topicRows = ai.topics ?? [{ key: "general", title: "Percakapan umum", summary: ai.summary, classifications: [], message_ids: rows.map((message) => message.id) }];
  const topicIds = new Map<string, string>();
  for (const topic of topicRows) {
    const existing = await admin.from("whatsapp_conversation_topics").select("id").eq("organization_id", organizationId).eq("wa_group_id", groupId).eq("topic_key", topic.key).is("deleted_at", null).maybeSingle();
    const existingData = existing as unknown as { data: { id: string } | null; error: { message: string } | null };
    if (existingData.error) throw new Error(existingData.error.message);
    const topicResult = existingData.data
      ? await admin.from("whatsapp_conversation_topics").update({ title: topic.title, last_summary: topic.summary, latest_message_at: rows.at(-1)?.received_at ?? null, updated_at: new Date().toISOString() }).eq("id", existingData.data.id).select("id").single()
      : await admin.from("whatsapp_conversation_topics").insert({ organization_id: organizationId, wa_group_id: groupId, topic_key: topic.key, title: topic.title, first_message_at: rows[0]?.received_at ?? null, latest_message_at: rows.at(-1)?.received_at ?? null, last_summary: topic.summary }).select("id").single();
    const topicData = topicResult as unknown as { data: { id: string } | null; error: { message: string } | null };
    if (topicData.error || !topicData.data) throw new Error(topicData.error?.message ?? "Topik WhatsApp tidak dapat disimpan.");
    topicIds.set(topic.key, topicData.data.id);
    const validMessageIds = new Set(rows.map((message) => message.id));
    const contextRows = topic.message_ids.filter((messageId) => validMessageIds.has(messageId)).flatMap((messageId) => topic.classifications.map((classification) => ({ organization_id: organizationId, wa_message_id: messageId, topic_id: topicData.data!.id, classification, confidence: 0.5, evidence: topic.summary })));
    if (contextRows.length) {
      const contexts = await admin.from("whatsapp_message_contexts").upsert(contextRows, { onConflict: "wa_message_id,topic_id,classification" });
      const contextResult = contexts as unknown as { error: { message: string } | null };
      if (contextResult.error) throw new Error(contextResult.error.message);
    }
  }
  for (const fact of ai.facts ?? []) {
    const topicId = topicIds.get(fact.topic_key);
    if (!topicId) continue;
    const factResult = await admin.from("whatsapp_conversation_facts").upsert({ organization_id: organizationId, topic_id: topicId, fact_key: fact.key, fact_value: fact.value, source_message_ids: fact.message_ids, confidence: fact.confidence, updated_at: new Date().toISOString() }, { onConflict: "topic_id,fact_key" });
    const factError = factResult as unknown as { error: { message: string } | null };
    if (factError.error) throw new Error(factError.error.message);
  }
  for (const decision of ai.decisions ?? []) {
    const topicId = topicIds.get(decision.topic_key);
    if (!topicId) continue;
    const decisionResult = await admin.from("whatsapp_conversation_decisions").insert({ organization_id: organizationId, topic_id: topicId, title: decision.title, decision_value: decision.value, source_message_ids: decision.message_ids, confidence: decision.confidence, requires_confirmation: true });
    const decisionError = decisionResult as unknown as { error: { message: string } | null };
    if (decisionError.error) throw new Error(decisionError.error.message);
  }
}

async function enqueueReply(admin: WorkerClient, message: MessageContext, text: string) {
  const result = await admin.rpc("enqueue_whatsapp_reply" as never, {
    p_organization_id: message.organization_id,
    p_message_id: message.id,
    p_connection_id: message.connection_id,
    p_session_id: message.session_id,
    p_provider: message.provider,
    p_chat_id: message.chat_id,
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
  const content = message.content;
  const command = parseExplicitCommand(content);
  const workItemCommand = parseExplicitWorkItemCommand(content);
  if (content?.trim().toLowerCase().startsWith("/task") && !command) {
    await enqueueReply(admin, message, explicitCommandHelp());
    return;
  }
  if (command) {
    const sender = await resolveParticipant(admin, message.wa_group_id, message.sender_participant_id);
    const maker = command.makerParticipantId ? await resolveProfileName(admin, message.wa_group_id, command.makerParticipantId) : sender;
    const checker = command.checkerParticipantId ? await resolveProfileName(admin, message.wa_group_id, command.checkerParticipantId) : null;
    if (sender.status !== "resolved" || !sender.profileId || maker.status !== "resolved" || !maker.profileId || (checker && (checker.status !== "resolved" || !checker.profileId)) || maker.profileId === checker?.profileId) {
      await enqueueReply(admin, message, "Identitas WhatsApp belum terverifikasi atau maker/checker konflik.");
      return;
    }
    const clientResult = await admin.from("clients").select("id").eq("organization_id", row.organization_id).is("deleted_at", null).or(`slug.eq.${command.clientRef},name.ilike.${command.clientRef}`).maybeSingle();
    const client = clientResult as unknown as { data: { id: string } | null; error: { message: string } | null };
    if (client.error || !client.data) {
      await enqueueReply(admin, message, "Client tidak ditemukan di organisasi ini.");
      return;
    }
    const workItemResult = await admin.rpc("create_whatsapp_command_work_item" as never, { p_organization_id: row.organization_id, p_client_id: client.data.id, p_title: command.title, p_due_at: command.dueAt, p_source_reference_id: message.id, p_source_metadata: { provider: "waha", creation_mode: "explicit_command", sender_profile_id: sender.profileId, maker_profile_id: maker.profileId, checker_profile_id: checker?.profileId ?? null }, p_created_by: sender.profileId, p_maker_id: maker.profileId, p_checker_id: checker?.profileId ?? null } as never);
    const workItem = workItemResult as unknown as { data: { id: string; title: string } | null; error: { message: string } | null };
    if (workItem.error || !workItem.data) throw new Error(workItem.error?.message ?? "Task gagal dibuat.");
    await enqueueReply(admin, message, `Task dibuat: ${workItem.data.title}`);
    return;
  }
  if (["/update", "/submit", "/status"].some((prefix) => content?.trim().toLowerCase().startsWith(prefix))) {
    if (!workItemCommand) {
      await enqueueReply(admin, message, explicitCommandHelp());
      return;
    }
    const sender = await resolveParticipant(admin, message.wa_group_id, message.sender_participant_id);
    if (sender.status !== "resolved" || !sender.profileId) {
      await enqueueReply(admin, message, "Identitas WhatsApp belum terverifikasi.");
      return;
    }
    const itemResult = await admin.from("work_items").select("id, status, title").eq("id", workItemCommand.workItemId).eq("organization_id", row.organization_id).is("deleted_at", null).maybeSingle();
    const item = itemResult as unknown as { data: { id: string; status: string; title: string } | null; error: { message: string } | null };
    if (item.error || !item.data) {
      await enqueueReply(admin, message, "Work item tidak ditemukan pada organisasi ini.");
      return;
    }
    if (workItemCommand.action === "status") {
      await enqueueReply(admin, message, `${item.data.title}: ${item.data.status}`);
      return;
    }
    const assignmentsResult = await admin.from("assignments").select("role").eq("work_item_id", item.data.id).eq("profile_id", sender.profileId).is("unassigned_at", null);
    const assignments = assignmentsResult as unknown as { data: { role: string }[] | null; error: { message: string } | null };
    const toStatus = workItemCommand.action === "submit" ? "submitted" : workItemCommand.status as WorkItemStatus | null;
    if (assignments.error || !assignments.data?.some((assignment) => toStatus && getTransition(item.data!.status as WorkItemStatus, toStatus) && canTransition(item.data!.status as WorkItemStatus, toStatus, assignment.role as AssignmentRole))) {
      await enqueueReply(admin, message, "Transisi atau status tidak diizinkan untuk role Anda.");
      return;
    }
    const transitionResult = await admin.rpc("transition_work_item" as never, { p_work_item_id: item.data.id, p_to_status: toStatus, p_actor_id: sender.profileId, p_reason: workItemCommand.reason } as never);
    const transition = transitionResult as unknown as { error: { message: string } | null };
    if (transition.error) throw new Error(transition.error.message);
    await enqueueReply(admin, message, `Work item diperbarui: ${toStatus}`);
    return;
  }
  await enqueueAiExtraction(admin, row.organization_id, message.id);
}

async function processReply(admin: WorkerClient, row: JobRow) {
  const connectionId = typeof row.payload.connection_id === "string" ? row.payload.connection_id : null;
  const sessionId = typeof row.payload.session_id === "string" ? row.payload.session_id : null;
  const provider = typeof row.payload.provider === "string" ? row.payload.provider : null;
  const chatId = typeof row.payload.chat_id === "string" ? row.payload.chat_id : null;
  const text = typeof row.payload.text === "string" ? row.payload.text : null;
  if (!connectionId || !sessionId || !provider || !chatId || !text) throw new Error("Payload reply WhatsApp tidak lengkap.");
  const adapter = createWhatsAppSessionAdapter({ connectionId, sessionId, provider });
  await adapter.sendText(chatId, text);
}

export async function runAiExtractionWorker(admin: WorkerClient) {
  const workerId = `ai-extraction-${crypto.randomUUID()}`;
  const summaryWorkerId = `whatsapp-summary-${crypto.randomUUID()}`;
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin, workerId, "ai_intake_requested");
    if (!row) break;
    try { await processAiIntake(admin, row); await markCompleted(admin, row, workerId); processed += 1; }
    catch (error) { await markFailed(admin, row, workerId, error); failed += 1; console.error("[ai-extraction-worker] AI intake gagal:", { outboxId: row.id, message: errorMessage(error) }); }
  }
  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin, workerId, "ai_extraction_requested");
    if (!row) break;
    try {
      await processJob(admin, row);
      await markCompleted(admin, row, workerId);
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
      await markCompleted(admin, row, workerId);
      processed += 1;
    } catch (error) {
      await markFailed(admin, row, workerId, error);
      failed += 1;
      console.error("[ai-extraction-worker] Pemrosesan gagal:", { outboxId: row.id, message: errorMessage(error) });
    }
  }
  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin, summaryWorkerId, "whatsapp_conversation_summary_requested");
    if (!row) break;
    try { await processConversationSummary(admin, row); await markCompleted(admin, row, summaryWorkerId); processed += 1; }
    catch (error) { await markFailed(admin, row, summaryWorkerId, error); failed += 1; }
  }
  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin, workerId, "whatsapp_reply_requested");
    if (!row) break;
    try {
      await processReply(admin, row);
      await markCompleted(admin, row, workerId);
      processed += 1;
    } catch (error) {
      await markFailed(admin, row, workerId, error);
      failed += 1;
      console.error("[ai-extraction-worker] Pemrosesan gagal:", { outboxId: row.id, message: errorMessage(error) });
    }
  }
  return { processed, failed };
}
