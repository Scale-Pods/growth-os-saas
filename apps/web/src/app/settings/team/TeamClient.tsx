"use client";

import { useState, useTransition } from "react";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  changeMemberRoleAction,
  createInvitationAction,
  removeMemberAction,
  revokeInvitationAction,
} from "./actions";

export interface MemberRow {
  userId: string;
  role: string;
  status: string;
  name: string;
  email: string;
  isYou: boolean;
}
export interface InviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

const ROLES = ["admin", "editor", "reviewer", "viewer"] as const;

type Outcome = { ok: true } | { ok: false; error: { message: string } };

export function TeamClient({
  members,
  invites,
  canManage,
  isOwner,
}: {
  members: MemberRow[];
  invites: InviteRow[];
  canManage: boolean;
  isOwner: boolean;
}) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("editor");
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const roleOptions: string[] = isOwner ? ["owner", ...ROLES] : [...ROLES];

  function run(fn: () => Promise<Outcome>, okText: string) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      setMessage(res.ok ? { tone: "ok", text: okText } : { tone: "error", text: res.error.message });
    });
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLink(null);
    start(async () => {
      const res = await createInvitationAction({ email, role });
      if (res.ok) {
        setLink(res.data.link);
        setEmail("");
        setMessage({
          tone: "ok",
          text: `Invitation created for ${res.data.email}. Share the link below. It works once and expires in 7 days.`,
        });
      } else {
        setMessage({ tone: "error", text: res.error.message });
      }
    });
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          role="status"
          className={message.tone === "error" ? "panel border border-red-500/40 text-red-400 text-sm" : "panel text-sm"}
        >
          {message.text}
        </div>
      )}

      {canManage ? (
        <Panel className="space-y-4">
          <h2 className="text-base font-semibold">Invite a teammate</h2>
          <form onSubmit={invite} className="flex flex-col md:flex-row gap-3 md:items-end">
            <div className="flex-1">
              <label className="label" htmlFor="invite-email">
                Email
              </label>
              <input
                id="invite-email"
                className="input"
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
            <div>
              <label className="label" htmlFor="invite-role">
                Role
              </label>
              <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" loading={pending}>
              <UserPlus size={16} className="mr-2 inline" />
              Create invite
            </Button>
          </form>
          {link && (
            <div className="flex items-center gap-2 text-sm">
              <input
                className="input flex-1"
                readOnly
                value={link}
                aria-label="Invitation link"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="ghost" onClick={() => navigator.clipboard.writeText(link)}>
                <Copy size={16} className="mr-1 inline" />
                Copy
              </Button>
            </div>
          )}
        </Panel>
      ) : (
        <Panel className="text-sm text-muted-foreground">Only owners and admins can invite people or change roles.</Panel>
      )}

      <Panel className="space-y-3">
        <h2 className="text-base font-semibold">Members ({members.length})</h2>
        <div className="divide-y divide-white/5">
          {members.map((m) => (
            <div key={m.userId} className="py-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {m.name || m.email || m.userId.slice(0, 8)} {m.isYou && <Badge tone="grey">You</Badge>}
                </p>
                {m.name && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
              </div>
              <div className="flex items-center gap-2">
                {canManage && !m.isYou ? (
                  <>
                    <select
                      className="input !w-auto"
                      aria-label={`Role for ${m.email || m.name}`}
                      value={m.role}
                      disabled={pending}
                      onChange={(e) =>
                        run(() => changeMemberRoleAction({ userId: m.userId, role: e.target.value }), "Role updated.")
                      }
                    >
                      {[...new Set([...(m.role === "owner" ? ["owner"] : []), ...roleOptions])].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Remove ${m.email || m.name}`}
                      onClick={() =>
                        confirm("Remove this member? They lose access immediately.") &&
                        run(() => removeMemberAction({ userId: m.userId }), "Member removed.")
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
                  </>
                ) : (
                  <Badge tone={m.role === "owner" ? "green" : "blue"}>{m.role}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {canManage && (
        <Panel className="space-y-3">
          <h2 className="text-base font-semibold">Pending invitations</h2>
          {invites.length === 0 ? (
            <EmptyState
              title="No pending invitations"
              hint="Invitations you create appear here until they are accepted or expire."
            />
          ) : (
            <div className="divide-y divide-white/5">
              {invites.map((i) => (
                <div key={i.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => revokeInvitationAction({ invitationId: i.id }), "Invitation revoked.")}
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
