"use client";

import { useCallback, useState } from "react";
import { seedEmails } from "@/lib/seedEmails";
import { type AuditEvent } from "@/lib/auditLog";
import Inbox from "./Inbox";
import AuditLog from "@/components/AuditLog";

export default function Home() {
  // The demo starts with an empty audit log; events accrue as the user runs the
  // AI review and takes actions. "Reset Demo" clears it back to empty.
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  const logEvent = useCallback((event: AuditEvent) => {
    setAuditEvents((prev) => [event, ...prev]);
  }, []);

  const resetAudit = useCallback(() => setAuditEvents([]), []);

  return (
    <>
      <Inbox emails={seedEmails} onAudit={logEvent} onReset={resetAudit} />
      <AuditLog events={auditEvents} />
    </>
  );
}
