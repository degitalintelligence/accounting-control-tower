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

  for (const u of users) {
    // Create auth user
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    });

    if (error) {
      if (error.message.includes("already been registered")) {
        console.log(`  [skip] ${u.email} — already exists`);
      } else {
        console.error(`  [error] ${u.email}:`, error.message);
      }
      continue;
    }

    const userId = data.user.id;
    console.log(`  [created] ${u.email} → ${userId}`);

    // Update membership role (trigger created it as finance_staff)
    if (u.role !== "finance_staff") {
      const { error: updateError } = await admin
        .schema("acct_ctrl")
        .from("memberships")
        .update({ role: u.role })
        .eq("profile_id", userId)
        .eq("organization_id", ORG_ID);

      if (updateError) {
        console.error(
          `    [warn] Could not update membership role to ${u.role}:`,
          updateError.message
        );
      } else {
        console.log(`    → role updated to ${u.role}`);
      }
    }
  }

  console.log("\nDone. Test accounts:");
  console.log("  admin@kreasheet.com / Admin123!");
  console.log("  manager@kreasheet.com / Manager123!");
  console.log("  staff@kreasheet.com / Staff123!");
}

seed().catch(console.error);
