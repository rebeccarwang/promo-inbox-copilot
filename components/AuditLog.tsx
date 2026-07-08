import { AUDIT_EVENT_LABELS, type AuditEvent } from "@/lib/auditLog";

const MAX_EVENTS = 30;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AuditLog({ events }: { events: AuditEvent[] }) {
  const recent = events.slice(0, MAX_EVENTS);

  return (
    <div className="border-t border-zinc-200 bg-zinc-50 font-sans text-zinc-900">
      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Audit Log
          </h2>
          <span className="text-xs text-zinc-400">
            (latest {recent.length})
          </span>
        </div>

        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {recent.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-zinc-400">
              No audit events yet.
            </p>
          ) : (
            recent.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 px-3 py-2 text-sm"
              >
                <span className="w-28 shrink-0 text-xs text-zinc-400">
                  {formatTimestamp(event.createdAt)}
                </span>
                <span className="w-40 shrink-0 truncate text-xs font-medium text-zinc-500">
                  {AUDIT_EVENT_LABELS[event.eventType]}
                </span>
                <div className="min-w-0 flex-1">
                  {event.emailSubject && (
                    <p className="truncate font-medium" title={event.emailSubject}>
                      {event.emailSubject}
                    </p>
                  )}
                  <p className="truncate text-xs text-zinc-500" title={event.details}>
                    {event.details}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
