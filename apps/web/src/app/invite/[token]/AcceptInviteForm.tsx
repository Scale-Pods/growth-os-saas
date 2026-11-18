"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { acceptInvitationAction } from "./actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await acceptInvitationAction(token);
            if (res.ok) router.push("/dashboard");
            else setError(res.error);
          })
        }
      >
        Accept invitation
      </Button>
    </div>
  );
}
