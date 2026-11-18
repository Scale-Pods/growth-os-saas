import { createClient } from "@/lib/supabase/server";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const dynamic = "force-dynamic";

// The middleware sends signed-out visitors to /login?redirect=/invite/<token> first.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="panel max-w-md w-full space-y-4 p-8">
        <h1 className="text-2xl font-bold">You have been invited</h1>
        <p className="text-sm text-muted-foreground">
          Accept to join the workspace. You must be signed in with the email address the invitation was sent to, and
          that email must be verified.
        </p>
        {user?.email && <p className="text-sm">Signed in as {user.email}</p>}
        <AcceptInviteForm token={token} />
      </div>
    </main>
  );
}
