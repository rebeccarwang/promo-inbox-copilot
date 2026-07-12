import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fallbackToManualReview,
  parseClassification,
} from "@/lib/classificationSchema";
import { classify } from "@/lib/classifyEmail";
import { classifyWithLLM, llmEnabled } from "@/lib/llmClassifier";

// Email classifier route. Runs entirely server-side.
//
// - CLASSIFIER_MODE=llm (with OPENAI_API_KEY set) → real OpenAI classifier.
// - Otherwise (unset, "mock", or no key) → deterministic keyword mock.
//
// Both engines live in @/lib (classifyEmail = keyword, llmClassifier = OpenAI)
// so the UI, this route, and the eval harness share one implementation. The
// response shape is always a validated EmailClassificationResult, so the
// frontend contract is identical in both modes. The API key never leaves the
// server.

const RequestSchema = z.object({
  sender: z.string().min(1),
  subject: z.string().min(1),
  bodyText: z.string().min(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid request. Expected { sender, subject, bodyText } as non-empty strings.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  // The X-Classifier-Mode header tells the client which engine actually
  // produced the result, so the UI can be honest about mock vs LLM. The JSON
  // body (validated by EmailClassificationSchema) is unchanged.

  // Mock mode (default): deterministic keyword classifier, validated.
  if (!llmEnabled()) {
    return NextResponse.json(parseClassification(classify(parsed.data)), {
      headers: { "X-Classifier-Mode": "mock" },
    });
  }

  // LLM mode: on any OpenAI failure, return a safe manual_review classification.
  // We do NOT silently fall back to the mock — the reason makes the failure
  // explicit so it's visible in the UI and audit log.
  try {
    const { result, truncated } = await classifyWithLLM(parsed.data);
    const headers: Record<string, string> = { "X-Classifier-Mode": "llm" };
    // Tell the client which fields the schema had to shorten so it can log it.
    if (truncated.length > 0) headers["X-Truncated-Fields"] = truncated.join(",");
    return NextResponse.json(result, { headers });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      fallbackToManualReview(`LLM classifier failed: ${detail}`),
      { headers: { "X-Classifier-Mode": "llm-error" } }
    );
  }
}
