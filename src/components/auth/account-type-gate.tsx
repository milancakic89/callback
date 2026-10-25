import { AccountTypeDialog } from "@/components/auth/account-type-dialog";
import { readPendingSignup } from "@/lib/auth/pending-signup";

// Renders the account-type dialog while a pending-signup cookie exists. Setting or clearing that
// cookie in a Server Action re-renders the page, so the dialog opens right after sign-up (or a sign-in
// to an account with no type yet), stays through reloads, and goes away once a type is chosen.
export async function AccountTypeGate() {
  const pending = await readPendingSignup();
  return pending ? <AccountTypeDialog email={pending.email} /> : null;
}
