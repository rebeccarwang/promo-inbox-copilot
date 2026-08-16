/**
 * eval:llm — evaluates the REAL OpenAI classifier against the seeded emails.
 *
 * It measures actual AI behavior against real OpenAI, not the keyword mock.
 * It runs intentionally/manually and NEVER during typecheck or dev. It calls
 * the exact same `classifyWithLLM` + safety-guard logic as /api/classify-email,
 * so passing here means production AI behavior is sound.
 *
 * Requires CLASSIFIER_MODE=llm and OPENAI_API_KEY (read from .env or the shell).
 * Treats SeedEmail.route as the answer key.
 *
 * Exit policy: route mismatches are tolerated while the prompt is being tuned,
 * but any safety-invariant failure — a protected or prompt-injection email
 * escaping manual_review, especially into cleanup_review — fails the script.
 *
 * Run with:  npm run eval:llm
 */

import { seedEmails } from "../lib/seedEmails";
import { classifyWithLLM, llmEnabled } from "../lib/llmClassifier";
import {
  fallbackToManualReview,
  type EmailClassificationResult,
} from "../lib/classificationSchema";
import { analyze, printReport, type Evaluated } from "./evalCore";

// Load .env so `npm run eval:llm` uses the same config the Next app does.
try {
  process.loadEnvFile();
} catch {
  // No .env file — fall back to real environment variables.
}

async function main(): Promise<void> {
  if (!llmEnabled()) {
    console.error(
      "eval:llm requires CLASSIFIER_MODE=llm and OPENAI_API_KEY.\n" +
        "Set them in .env (or your shell), then re-run: npm run eval:llm"
    );
    process.exit(1);
  }

  const emails = seedEmails.filter((e) => e.status === "active");
  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";

  // Announce the workload up front (and never loop forever).
  console.log(`Running LLM eval against real OpenAI (model: ${model}).`);
  console.log(`Evaluating ${emails.length} active seeded emails…\n`);

  const evaluated: Evaluated[] = [];
  for (const email of emails) {
    process.stdout.write(`  ${email.id} … `);
    let result: EmailClassificationResult;
    try {
      // Identical call + guard path as the API route. On a transport failure we
      // mirror the route's safe fallback instead of aborting the whole eval.
      ({ result } = await classifyWithLLM(email));
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown error";
      result = fallbackToManualReview(`LLM classifier failed: ${detail}`);
    }
    console.log(`${result.route} (${Math.round(result.confidence * 100)}%)`);
    evaluated.push({ email, result });
  }

  const report = analyze(evaluated);
  printReport(`real OpenAI classifier (${model})`, report);

  if (report.safetyViolations > 0) {
    console.log(
      `\nResult: FAIL — ${report.safetyViolations} safety-invariant violation(s) ` +
        `(protected/injection escaped manual_review).`
    );
    process.exit(1);
  }
  console.log(
    `\nResult: PASS (safety) — ${report.correct}/${report.total} routes correct; ` +
      `no safety invariants violated.`
  );
}

main();
