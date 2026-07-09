"use client";

import { useMemo, useState } from "react";
import type { EmailRoute, SeedEmail } from "@/lib/seedEmails";
import { createAuditEvent, type AuditEvent } from "@/lib/auditLog";

const SECTIONS: { route: EmailRoute; title: string }[] = [
  { route: "cleanup_review", title: "Cleanup Review" },
  { route: "deal_digest", title: "Deal Digest" },
  { route: "subscription_digest", title: "Subscription Digest" },
  { route: "restock_alert", title: "Restock Alerts" },
  { route: "manual_review", title: "Manual Review" },
];

// Routes whose emails are opted IN (pre-checked for trash) by default.
const TRASH_DEFAULT_ROUTES: EmailRoute[] = [
  "deal_digest",
  "subscription_digest",
  "restock_alert",
];

// `flaggedWrong` is user feedback: the user thinks this email is mis-routed,
// and `suggestedRoute` is the lane they think it belongs in. Feedback only —
// the email never actually moves lanes.
type Row = SeedEmail & {
  selected: boolean;
  flaggedWrong: boolean;
  suggestedRoute: EmailRoute | null;
};

function toRows(emails: SeedEmail[]): Row[] {
  return emails.map((e) => ({
    ...e,
    selected:
      e.status === "active" && TRASH_DEFAULT_ROUTES.includes(e.route),
    flaggedWrong: false,
    suggestedRoute: null,
  }));
}

function routeTitle(route: EmailRoute | null): string {
  return SECTIONS.find((s) => s.route === route)?.title ?? "—";
}

function confidenceTone(confidence: number): string {
  if (confidence >= 0.85) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (confidence >= 0.7) return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-rose-50 text-rose-700 ring-rose-600/20";
}

const ACTION_BTN =
  "rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export default function Inbox({
  emails,
  onAudit,
}: {
  emails: SeedEmail[];
  onAudit: (event: AuditEvent) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(emails));
  // Which row's "should have been…" category picker is currently open.
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null);

  const selectedCount = useMemo(
    () => rows.filter((r) => r.selected).length,
    [rows]
  );

  const toggleSelect = (id: string) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );

  const toggleSectionSelect = (route: EmailRoute, checked: boolean) =>
    setRows((prev) =>
      prev.map((r) =>
        r.route === route && r.status === "active"
          ? { ...r, selected: checked }
          : r
      )
    );

  const moveSelectedToTrash = () => {
    rows
      .filter((r) => r.selected && r.status === "active")
      .forEach((r) =>
        onAudit(
          createAuditEvent({
            actor: "user",
            eventType: "USER_MOVED_TO_TRASH",
            emailId: r.id,
            emailSubject: r.subject,
            details: `Moved to simulated Trash from ${r.route}.`,
          })
        )
      );
    setRows((prev) =>
      prev.map((r) =>
        r.selected ? { ...r, status: "trashed", selected: false } : r
      )
    );
  };

  // Row feedback: the user flags an email as mis-routed and picks the lane it
  // should have been in. Records the signal only — the email stays put.
  const flagWrongCategory = (id: string, suggestedRoute: EmailRoute) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    onAudit(
      createAuditEvent({
        actor: "user",
        eventType: "USER_FLAGGED_WRONG_CATEGORY",
        emailId: row.id,
        emailSubject: row.subject,
        details: `Was ${row.route}; user says it should be ${suggestedRoute}.`,
      })
    );
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, flaggedWrong: true, suggestedRoute } : r
      )
    );
    setPickerOpenId(null);
  };

  const grouped = useMemo(() => {
    const map = new Map<EmailRoute, Row[]>();
    for (const r of rows) {
      const bucket = map.get(r.route) ?? [];
      bucket.push(r);
      map.set(r.route, bucket);
    }
    return map;
  }, [rows]);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Promo Inbox Copilot
            </h1>
            <p className="text-xs text-zinc-500">
              {rows.length} emails · {selectedCount} selected for trash
            </p>
          </div>
          <button
            type="button"
            onClick={moveSelectedToTrash}
            disabled={selectedCount === 0}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Move selected to trash ({selectedCount})
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {SECTIONS.map((section) => {
          const sectionRows = grouped.get(section.route) ?? [];
          const activeRows = sectionRows.filter((r) => r.status === "active");
          const allSelected =
            activeRows.length > 0 && activeRows.every((r) => r.selected);

          return (
            <section key={section.route}>
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={activeRows.length === 0}
                  onChange={(e) =>
                    toggleSectionSelect(section.route, e.target.checked)
                  }
                  className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
                  aria-label={`Select all in ${section.title}`}
                />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  {section.title}
                </h2>
                <span className="text-xs text-zinc-400">
                  ({sectionRows.length})
                </span>
              </div>

              <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
                {sectionRows.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-zinc-400">
                    No emails in this route.
                  </p>
                ) : (
                  <div className="flex items-center gap-3 rounded-t-lg bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    <span className="w-3.5 shrink-0" aria-hidden />
                    <span className="w-56 shrink-0">Sender</span>
                    <span className="min-w-0 flex-1">Summary</span>
                    <span className="hidden w-36 shrink-0 lg:inline">Route</span>
                    <span className="w-11 shrink-0 text-center">Conf.</span>
                    <span className="hidden w-16 shrink-0 text-right md:inline">Status</span>
                    <span className="shrink-0">Feedback</span>
                  </div>
                )}
                {sectionRows.map((row) => {
                  const trashed = row.status === "trashed";
                  return (
                    <div
                      key={row.id}
                      className={`flex items-center gap-3 px-3 py-2 text-sm ${
                        trashed ? "opacity-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={trashed}
                        onChange={() => toggleSelect(row.id)}
                        className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 accent-zinc-900"
                        aria-label={`Select ${row.subject}`}
                      />

                      {/* Sender + subject */}
                      <div className="w-56 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <p
                            className={`truncate font-medium ${
                              trashed ? "line-through" : ""
                            }`}
                            title={row.subject}
                          >
                            {row.subject}
                          </p>
                          {row.isProtected && (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                              Protected
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-zinc-500" title={row.sender}>
                          {row.sender}
                        </p>
                      </div>

                      {/* Summary + reason */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-zinc-700" title={row.summary}>
                          {row.summary}
                        </p>
                        <p className="truncate text-xs text-zinc-400" title={row.reason}>
                          {row.reason}
                        </p>
                        {row.isProtected && row.protectionReason && (
                          <p
                            className="truncate text-xs text-emerald-700"
                            title={row.protectionReason}
                          >
                            🔒 {row.protectionReason}
                          </p>
                        )}
                      </div>

                      {/* Route */}
                      <span className="hidden w-36 shrink-0 truncate font-mono text-xs text-zinc-400 lg:inline">
                        {row.route}
                      </span>

                      {/* Confidence */}
                      <span
                        className={`w-11 shrink-0 rounded-full text-center text-xs font-medium ring-1 ring-inset ${confidenceTone(
                          row.confidence
                        )}`}
                      >
                        {Math.round(row.confidence * 100)}%
                      </span>

                      {/* Status tag */}
                      <span className="hidden w-16 shrink-0 text-right text-xs md:inline">
                        {trashed && (
                          <span className="text-zinc-400">trashed</span>
                        )}
                      </span>

                      {/* Feedback */}
                      <div className="relative flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setPickerOpenId((cur) =>
                              cur === row.id ? null : row.id
                            )
                          }
                          aria-expanded={pickerOpenId === row.id}
                          title="Flag this email as mis-routed and pick where it belongs (feedback only)"
                          className={`${ACTION_BTN} ${
                            row.flaggedWrong
                              ? "bg-amber-600 text-white ring-amber-600"
                              : "bg-amber-50 text-amber-700 ring-amber-600/20 hover:bg-amber-100"
                          }`}
                        >
                          {row.flaggedWrong
                            ? `Wrong → ${routeTitle(row.suggestedRoute)}`
                            : "Wrong category"}
                        </button>

                        {pickerOpenId === row.id && (
                          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
                            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                              Should have been…
                            </p>
                            {SECTIONS.filter(
                              (s) => s.route !== row.route
                            ).map((s) => (
                              <button
                                key={s.route}
                                type="button"
                                onClick={() =>
                                  flagWrongCategory(row.id, s.route)
                                }
                                className="block w-full rounded px-2 py-1 text-left text-xs text-zinc-700 hover:bg-zinc-100"
                              >
                                {s.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
