import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => "mock-model"),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
  NoObjectGeneratedError: class NoObjectGeneratedError extends Error {
    static isInstance(e: unknown) {
      return e instanceof this;
    }
  },
}));

import { generateObject, NoObjectGeneratedError } from "ai";
import { POST, __resetRateLimitForTests } from "./route";

const mockGenerate = generateObject as unknown as Mock;

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

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitForTests();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/ai/generate-tasks", () => {
  it("returns 200 with 5 generated tasks on a valid request", async () => {
    mockGenerate.mockResolvedValueOnce({ object: VALID_RESPONSE });

    const response = await POST(makeRequest({ projectTitle: "Launch new widget" }));

    expect(response.status).toBe(200);
    const json = (await response.json()) as typeof VALID_RESPONSE;
    expect(json.tasks).toHaveLength(5);
    expect(json.tasks[0]).toMatchObject({
      title: "Define MVP scope and constraints",
      category: "strategy",
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when projectTitle is missing", async () => {
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBeTruthy();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns 400 when projectTitle is an empty string", async () => {
    const response = await POST(makeRequest({ projectTitle: "" }));

    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    expect(json.error).toMatch(/required/i);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns 502 when generateObject throws NoObjectGeneratedError", async () => {
    const NoObjectErrCtor = NoObjectGeneratedError as unknown as new (message?: string) => Error;
    mockGenerate.mockRejectedValueOnce(new NoObjectErrCtor("bad output"));

    const response = await POST(makeRequest({ projectTitle: "Launch" }));

    expect(response.status).toBe(502);
    const json = (await response.json()) as { error: string };
    expect(json.error).toMatch(/unexpected/i);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns 500 when generateObject throws a generic error", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("upstream timeout"));

    const response = await POST(makeRequest({ projectTitle: "Launch" }));

    expect(response.status).toBe(500);
    const json = (await response.json()) as { error: string };
    expect(json.error).toMatch(/snag/i);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns 429 on the 11th request from the same IP within a minute", async () => {
    mockGenerate.mockResolvedValue({ object: VALID_RESPONSE });

    for (let i = 0; i < 10; i += 1) {
      const ok = await POST(makeRequest({ projectTitle: "Launch" }));
      expect(ok.status).toBe(200);
    }

    const limited = await POST(makeRequest({ projectTitle: "Launch" }));
    expect(limited.status).toBe(429);
    const json = (await limited.json()) as { error: string };
    expect(json.error).toMatch(/too many/i);
    expect(mockGenerate).toHaveBeenCalledTimes(10);
  });
});
