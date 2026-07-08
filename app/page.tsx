"use client";

import { useCallback, useState } from "react";
import { seedEmails } from "@/lib/seedEmails";
import { createAuditEvent, type AuditEvent } from "@/lib/auditLog";
import Inbox from "./Inbox";
import AuditLog from "@/components/AuditLog";

// System records: protected emails that were routed to Manual Review.
function initialAuditEvents(): AuditEvent[] {
  return seedEmails
    .filter((e) => e.isProtected && e.route === "manual_review")
    .map((e) =>
      createAuditEvent({
        id: `sys-protected-${e.id}`,
        actor: "system",
        eventType: "SYSTEM_PROTECTED_EMAIL",
        emailId: e.id,
        emailSubject: e.subject,
        details:
          e.protectionReason ??
          "Protected email routed to Manual Review instead of cleanup.",
      })
    );
}

export default function Home() {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(
    initialAuditEvents
  );

  const logEvent = useCallback((event: AuditEvent) => {
    setAuditEvents((prev) => [event, ...prev]);
  }, []);

  return (
    <>
      <Inbox emails={seedEmails} onAudit={logEvent} />
      <AuditLog events={auditEvents} />
    </>
  );
}
