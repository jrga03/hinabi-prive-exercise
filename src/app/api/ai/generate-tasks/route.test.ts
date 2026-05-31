import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => "mock-model"),
}));

vi.mock("ai", () => ({
  streamObject: vi.fn(),
}));

import { streamObject } from "ai";
import { POST, __resetRateLimitForTests } from "./route";

const mockStream = streamObject as unknown as Mock;

const VALID_RESPONSE = {
  tasks: [
    { title: "Define MVP scope and constraints", category: "strategy" as const },
    { title: "Sketch initial UI flow", category: "design" as const },
    { title: "Set up Next.js project skeleton", category: "engineering" as const },
    { title: "Draft launch announcement", category: "marketing" as const },
    { title: "Choose hosting platform", category: "operations" as const },
  ],
};

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/ai/generate-tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "test-ip",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeStreamResult(chunks: string[]): { toTextStreamResponse: () => Response } {
  return {
    toTextStreamResponse: () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } }
      ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitForTests();
  // Silence the route's stream-error logger; nothing in this suite asserts on it.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/ai/generate-tasks", () => {
  it("streams the JSON payload as text/plain on a valid request", async () => {
    const json = JSON.stringify(VALID_RESPONSE);
    // Split into chunks so we exercise the streaming code path, not just a
    // single-shot response that happens to use a ReadableStream.
    mockStream.mockReturnValueOnce(
      makeStreamResult([json.slice(0, 40), json.slice(40, 120), json.slice(120)])
    );

    const response = await POST(makeRequest({ projectTitle: "Launch new widget" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type") ?? "").toMatch(/text\/plain/);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual(VALID_RESPONSE);
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when projectTitle is missing", async () => {
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBeTruthy();
    expect(mockStream).not.toHaveBeenCalled();
  });

  it("returns 400 when projectTitle is an empty string", async () => {
    const response = await POST(makeRequest({ projectTitle: "" }));

    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    expect(json.error).toMatch(/required/i);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it("returns 429 on the 11th request from the same IP within a minute", async () => {
    const json = JSON.stringify(VALID_RESPONSE);
    mockStream.mockImplementation(() => makeStreamResult([json]));

    for (let i = 0; i < 10; i += 1) {
      const ok = await POST(makeRequest({ projectTitle: "Launch" }));
      expect(ok.status).toBe(200);
      // Drain the body so the underlying stream doesn't leak between iterations.
      await ok.text();
    }

    const limited = await POST(makeRequest({ projectTitle: "Launch" }));
    expect(limited.status).toBe(429);
    const limitedJson = (await limited.json()) as { error: string };
    expect(limitedJson.error).toMatch(/too many/i);
    expect(mockStream).toHaveBeenCalledTimes(10);
  });
});
