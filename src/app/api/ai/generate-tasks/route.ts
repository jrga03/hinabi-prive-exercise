import { google } from "@ai-sdk/google";
import { streamObject } from "ai";

import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { AIResponseSchema, RequestSchema } from "@/lib/ai/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Demo-grade in-memory rate limiter. Process-local — resets on cold start, does
// not coordinate across Vercel functions. Replace with Upstash + IP-or-user key
// before any real traffic.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBucket = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "anonymous";
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateBucket.get(key);
  if (!entry || entry.resetAt <= now) {
    rateBucket.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function __resetRateLimitForTests(): void {
  rateBucket.clear();
}

export async function POST(request: Request) {
  const key = clientKey(request);
  if (!checkRateLimit(key)) {
    return jsonError("Too many requests. Try again in a moment.", 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const parsed = RequestSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const issues = [...Object.values(flat.fieldErrors).flat(), ...flat.formErrors].filter(Boolean);
    const message = issues.length > 0 ? issues.join("; ") : "Invalid request body.";
    return jsonError(message, 400);
  }

  // streamObject returns synchronously; upstream errors surface through the
  // stream (onError + the textStream rejecting). The HTTP status is committed
  // the moment we hand back the Response, so invalid-output detection has to
  // happen on the client by validating the final accumulated JSON.
  const result = streamObject({
    model: google("gemini-2.5-flash"),
    schema: AIResponseSchema,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(parsed.data),
    onError({ error }) {
      console.error("[ai/generate-tasks] stream error", error);
    },
  });

  return result.toTextStreamResponse();
}
