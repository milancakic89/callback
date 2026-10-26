import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MOCK_CANDIDATES, type MockCandidate } from "../src/lib/candidates/mock-candidates";
import { createAdminClient, loadEnv } from "../scraper/supabase";

// Makes the three mock candidates of features/demo-job.md: real Supabase accounts (candidate type,
// sign-in blocked) with a row in candidate_profiles. Run once with `npm run seed:mock-candidates`,
// after the employer_jobs migration; local development and production share one project. Running
// it again creates nothing new, so it is also how a half-finished run is completed.

// The longest ban the auth API takes is in hours; this is a hundred years.
const BAN_DURATION = "876000h";

async function findAccountId(supabase: SupabaseClient, email: string): Promise<string | null> {
  // The admin API can't look a user up by email; this RPC can, for the secret-key client only.
  const { data, error } = await supabase.rpc("account_for_email", { p_email: email });
  if (error) throw new Error(`account_for_email(${email}): ${error.message}`);
  return (data as { id: string }[] | null)?.[0]?.id ?? null;
}

async function ensureAccount(supabase: SupabaseClient, candidate: MockCandidate): Promise<string> {
  const existingId = await findAccountId(supabase, candidate.email);

  if (existingId) {
    // Never take over an account somebody else made, even on a reserved domain.
    const { data, error } = await supabase.auth.admin.getUserById(existingId);
    if (error) throw new Error(`getUserById(${candidate.email}): ${error.message}`);
    if (data.user.app_metadata?.mock !== true) {
      throw new Error(`${candidate.email} is a real account, not a mock one. Refusing to touch it.`);
    }
    return existingId;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: candidate.email,
    email_confirm: true,
    // Nobody is meant to know it: the account is banned as well.
    password: randomBytes(32).toString("base64url"),
    app_metadata: { account_type: "candidate", mock: true },
    ban_duration: BAN_DURATION,
  });
  if (error || !data.user) throw new Error(`createUser(${candidate.email}): ${error?.message ?? "no user"}`);
  return data.user.id;
}

async function main() {
  const supabase = createAdminClient(loadEnv());

  // Before any account is made, so a missing migration doesn't leave accounts without profiles.
  const { error: tableError } = await supabase.from("candidate_profiles").select("user_id").limit(1);
  if (tableError) {
    throw new Error(`candidate_profiles is not readable (is the employer_jobs migration applied?): ${tableError.message}`);
  }

  for (const candidate of MOCK_CANDIDATES) {
    const userId = await ensureAccount(supabase, candidate);
    const { error } = await supabase.from("candidate_profiles").upsert(
      {
        user_id: userId,
        full_name: candidate.name,
        location: candidate.location,
        is_mock: true,
        sample_key: candidate.key,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`candidate_profiles(${candidate.key}): ${error.message}`);
    console.log(`${candidate.name} <${candidate.email}> ${userId}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
