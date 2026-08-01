/**
 * Seed script: Create 3 test users + memberships.
 *
 * Usage:
 *   node scripts/seed-users.mjs
 *
 * Requires .env.local with:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * The auth trigger (002/003) will auto-create profiles and memberships,
 * but we also update membership roles here for admin and manager.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_ID = "00000000-0000-0000-0000-000000000001";

const users = [
  {
    email: "admin@kreasheet.com",
    password: "Admin123!",
    full_name: "Admin Kreasheet",
    role: "admin",
  },
  {
    email: "manager@kreasheet.com",
    password: "Manager123!",
    full_name: "Finance Manager",
    role: "finance_manager",
  },
  {
    email: "staff@kreasheet.com",
    password: "Staff123!",
    full_name: "Finance Staff",
    role: "finance_staff",
  },
];

async function seed() {
  console.log("Seeding test users...\n");

  const { error: organizationError } = await admin
    .schema("acct_ctrl")
    .from("organizations")
    .upsert(
      {
        id: ORG_ID,
        name: "Kreasheet Accounting",
        slug: "kreasheet",
        settings: { timezone: "Asia/Jakarta", currency: "IDR" },
      },
      { onConflict: "id" }
    );

  if (organizationError) throw organizationError;

  for (const u of users) {
    let user;
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    });

    if (error?.message.includes("already been registered")) {
      const { data: listed, error: listError } = await admin.auth.admin.listUsers({
        perPage: 1000,
      });
      if (listError) throw listError;
      user = listed.users.find((candidate) => candidate.email === u.email);
      console.log(`  [existing] ${u.email} → ${user?.id ?? "not found"}`);
    } else if (error) {
      throw error;
    } else {
      user = data.user;
      console.log(`  [created] ${u.email} → ${user.id}`);
    }

    if (!user) throw new Error(`Auth user not found: ${u.email}`);

    const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, {
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    });
    if (passwordError) throw passwordError;

    const { error: profileError } = await admin
      .schema("acct_ctrl")
      .from("profiles")
      .upsert(
        { id: user.id, display_name: u.full_name, email: u.email },
        { onConflict: "id" }
      );
    if (profileError) throw profileError;

    const { data: existingMembership, error: membershipLookupError } = await admin
      .schema("acct_ctrl")
      .from("memberships")
      .select("id")
      .eq("profile_id", user.id)
      .eq("organization_id", ORG_ID)
      .is("client_id", null)
      .is("entity_id", null)
      .limit(1)
      .maybeSingle();
    if (membershipLookupError) throw membershipLookupError;

    const membershipPayload = {
      profile_id: user.id,
      organization_id: ORG_ID,
      role: u.role,
      is_active: true,
    };
    const membershipMutation = existingMembership
      ? admin.schema("acct_ctrl").from("memberships").update(membershipPayload).eq("id", existingMembership.id)
      : admin.schema("acct_ctrl").from("memberships").insert(membershipPayload);
    const { error: membershipError } = await membershipMutation;
    if (membershipError) throw membershipError;
    console.log(`    → membership ensured (${u.role})`);
  }

  console.log("\nDone. Test accounts:");
  console.log("  admin@kreasheet.com / Admin123!");
  console.log("  manager@kreasheet.com / Manager123!");
  console.log("  staff@kreasheet.com / Staff123!");
}

seed().catch(console.error);
