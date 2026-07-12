/**
 * eval:mock — cheap, deterministic regression check for the KEYWORD classifier.
 *
 * No API key and no network, so it's safe to run on every typecheck/commit. It
 * exercises schema validity, route labels, the protected invariant, and basic
 * plumbing — it does NOT measure real AI behavior. Use `npm run eval:llm` for
 * that.
 *
 * Treats SeedEmail.route as the answer key. Exits non-zero on any failed check.
 *
 * Run with:  npm run eval:mock
 */

import { seedEmails } from "../lib/seedEmails";
import { classify } from "../lib/classifyEmail";
import { parseClassification } from "../lib/classificationSchema";
import { analyze, printReport, type Evaluated } from "./evalCore";

function main(): void {
  const emails = seedEmails.filter((e) => e.status === "active");
  console.log(
    `Running MOCK eval (deterministic keyword classifier) on ${emails.length} active emails…`
  );

  // Same keyword engine the API route runs in mock mode, validated through the
  // same schema.
  const evaluated: Evaluated[] = emails.map((email) => ({
    email,
    result: parseClassification(classify(email)),
  }));

  const report = analyze(evaluated);
  printReport("mock keyword classifier (deterministic, offline)", report);

  // Strict regression gate: any route mismatch, schema failure, or safety issue
  // fails the run.
  const ok =
    report.mismatches.length === 0 &&
    report.schemaInvalid.length === 0 &&
    report.safetyViolations === 0;

  console.log(
    `\nResult: ${ok ? "PASS" : "FAIL"} — ${report.correct}/${report.total} routes correct.`
  );
  if (!ok) process.exit(1);
}

main();
