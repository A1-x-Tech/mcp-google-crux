import { test } from "node:test";
import assert from "node:assert/strict";
import { CruxClient } from "./client.js";
import type { CruxConfig } from "./types.js";
import { CredentialsError, CruxError, CruxNoDataError } from "./types.js";

const BASE = "https://chromeuxreport.googleapis.com";

type Call = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | undefined };

/** Installs a recording fetch stub and returns a client + the captured calls. */
function harness(extra: Partial<CruxConfig> = {}) {
  const calls: Call[] = [];
  const config: CruxConfig = {
    apiKey: "KEY",
    apiBase: BASE,
    maxRetries: 0,
    retryBaseMs: 0,
    ...extra,
  };

  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify({ record: {} }), { status: 200 });
  }) as typeof fetch;

  return { client: new CruxClient(config), calls, restore: () => { globalThis.fetch = orig; } };
}

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as RequestInit;
    calls.push({ url: String(url), init: i });
    return handler(String(url), i);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function makeClient(overrides: Partial<CruxConfig> = {}) {
  return new CruxClient({
    apiKey: "KEY",
    apiBase: BASE,
    retryBaseMs: 0, // no real backoff delay in tests
    ...overrides,
  });
}

test("queryRecord: POST to :queryRecord with key= param, PHONE mapping and exact body", async () => {
  const { client, calls, restore } = harness();
  try {
    await client.queryRecord({
      origin: "https://example.com",
      formFactor: "phone",
      metrics: ["largest_contentful_paint", "cumulative_layout_shift"],
    });
  } finally {
    restore();
  }
  assert.equal(calls[0].url, `${BASE}/v1/records:queryRecord?key=KEY`);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers["Content-Type"], "application/json");
  assert.deepEqual(calls[0].body, {
    origin: "https://example.com",
    formFactor: "PHONE",
    metrics: ["largest_contentful_paint", "cumulative_layout_shift"],
  });
});

test("queryHistoryRecord: POST to :queryHistoryRecord with url + collectionPeriodCount", async () => {
  const { client, calls, restore } = harness();
  try {
    await client.queryHistoryRecord({ url: "https://example.com/page/", collectionPeriodCount: 40 });
  } finally {
    restore();
  }
  assert.equal(calls[0].url, `${BASE}/v1/records:queryHistoryRecord?key=KEY`);
  assert.deepEqual(calls[0].body, { url: "https://example.com/page/", collectionPeriodCount: 40 });
});

test("origin XOR url: both or neither is rejected before any fetch", async () => {
  const { client, calls, restore } = harness();
  try {
    await assert.rejects(
      () => client.queryRecord({ origin: "https://a.com", url: "https://a.com/x" }),
      /exactly one of `origin` or `url`/,
    );
    await assert.rejects(() => client.queryRecord({}), /exactly one of `origin` or `url`/);
    await assert.rejects(() => client.queryHistoryRecord({}), /exactly one of `origin` or `url`/);
    assert.equal(calls.length, 0, "invalid subject must never reach the API");
  } finally {
    restore();
  }
});

test("404 throws CruxNoDataError with a readable no-data message", async () => {
  const mock = mockFetch(() =>
    new Response(
      JSON.stringify({ error: { code: 404, message: "chrome ux report data not found", status: "NOT_FOUND" } }),
      { status: 404 },
    ),
  );
  try {
    await assert.rejects(
      () => makeClient({ maxRetries: 0 }).queryRecord({ origin: "https://tiny.example" }),
      (err: unknown) => {
        assert.ok(err instanceof CruxNoDataError);
        assert.ok(err instanceof CruxError);
        assert.equal(err.status, 404);
        assert.match(err.message, /No CrUX data/);
        return true;
      },
    );
    assert.equal(mock.calls.length, 1, "404 is a definitive answer — never retried");
  } finally {
    mock.restore();
  }
});

test("429 is retried; when exhausted the error explains the 150/min quota", async () => {
  let calls = 0;
  const mock = mockFetch(() => {
    calls++;
    if (calls === 1) return new Response("slow down", { status: 429 });
    return new Response(JSON.stringify({ record: {} }), { status: 200 });
  });
  try {
    const result = await makeClient({ maxRetries: 1 }).queryRecord({ origin: "https://a.com" });
    assert.deepEqual(result, { record: {} });
    assert.equal(calls, 2);
  } finally {
    mock.restore();
  }

  calls = 0;
  const mock2 = mockFetch(() => {
    calls++;
    return new Response(JSON.stringify({ error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } }), {
      status: 429,
    });
  });
  try {
    await assert.rejects(
      () => makeClient({ maxRetries: 2 }).queryRecord({ origin: "https://a.com" }),
      /150 queries per minute/,
    );
    assert.equal(calls, 3); // initial + 2 retries
  } finally {
    mock2.restore();
  }
});

test("5xx is retried; 400 is not and surfaces the Google error envelope", async () => {
  let calls = 0;
  const mock = mockFetch(() => {
    calls++;
    if (calls === 1) return new Response("unavailable", { status: 503 });
    return new Response(JSON.stringify({ record: {} }), { status: 200 });
  });
  try {
    const result = await makeClient({ maxRetries: 1 }).queryRecord({ origin: "https://a.com" });
    assert.deepEqual(result, { record: {} });
    assert.equal(calls, 2);
  } finally {
    mock.restore();
  }

  calls = 0;
  const mock2 = mockFetch(() => {
    calls++;
    return new Response(
      JSON.stringify({ error: { code: 400, message: "API key not valid", status: "INVALID_ARGUMENT" } }),
      { status: 400 },
    );
  });
  try {
    await assert.rejects(
      () => makeClient({ maxRetries: 3 }).queryRecord({ origin: "https://a.com" }),
      /HTTP 400: API key not valid \(INVALID_ARGUMENT\)/,
    );
    assert.equal(calls, 1, "400 must not be retried");
  } finally {
    mock2.restore();
  }
});

test("network errors are retried, then rethrown after maxRetries", async () => {
  let calls = 0;
  const mock = mockFetch(() => {
    calls++;
    if (calls === 1) throw new Error("ECONNRESET");
    return new Response(JSON.stringify({ record: {} }), { status: 200 });
  });
  try {
    const result = await makeClient({ maxRetries: 1 }).queryRecord({ origin: "https://a.com" });
    assert.deepEqual(result, { record: {} });
    assert.equal(calls, 2);
  } finally {
    mock.restore();
  }

  calls = 0;
  const mock2 = mockFetch(() => {
    calls++;
    throw new Error("ECONNRESET");
  });
  try {
    await assert.rejects(() => makeClient({ maxRetries: 2 }).queryRecord({ origin: "https://a.com" }), /ECONNRESET/);
    assert.equal(calls, 3); // initial + 2 retries
  } finally {
    mock2.restore();
  }
});

test("a hung request aborts with a timeout message that never contains the key", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: unknown, init: unknown) =>
    new Promise((_resolve, reject) => {
      const signal = (init as RequestInit).signal as AbortSignal;
      signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    })) as typeof fetch;
  try {
    const client = makeClient({ timeoutMs: 10, maxRetries: 0 });
    await assert.rejects(
      () => client.queryRecord({ origin: "https://a.com" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /timed out after 10ms/);
        assert.ok(!err.message.includes("KEY"), "the API key must never leak into error messages");
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

// --- Missing credentials (degraded start) ---

// The exact startup-era text, relayed verbatim at call time — pinned so a
// reworded message does not silently change what the model tells the user.
const MISSING_KEY_TEXT =
  "CRUX_API_KEY is required (a Google Cloud API key with the Chrome UX Report API enabled; " +
  "create one at https://console.cloud.google.com/apis/credentials).";

test("request() without an api key throws CredentialsError; fetch is never called", async () => {
  const mock = mockFetch(() => new Response("{}", { status: 200 }));
  try {
    const client = new CruxClient({ apiBase: BASE, retryBaseMs: 0 });
    await assert.rejects(
      () => client.queryRecord({ origin: "https://example.com" }),
      (err: unknown) => {
        assert.ok(err instanceof CredentialsError, "must be a CredentialsError");
        assert.equal((err as Error).name, "CredentialsError");
        const message = (err as Error).message;
        assert.ok(
          message.includes(MISSING_KEY_TEXT),
          `message must carry the exact startup text, got: ${message}`,
        );
        assert.match(message, /restart the server/);
        return true;
      },
    );
    // Not transport trouble: the retry/backoff loop — and fetch itself —
    // must never run for a configuration problem.
    assert.equal(mock.calls.length, 0, "fetch must not be called without credentials");
  } finally {
    mock.restore();
  }
});

test("request() rejects an absolute path (SSRF) and never sends the key to a foreign origin", async () => {
  for (const evil of ["https://evil.example/steal", "http://evil.example/x", "\\\\evil.example/x"]) {
    const mock = mockFetch(() => new Response("{}", { status: 200 }));
    try {
      await assert.rejects(() => makeClient().request(evil, {}), /foreign origin/);
      assert.equal(mock.calls.length, 0, `must not fetch for ${JSON.stringify(evil)}`);
    } finally {
      mock.restore();
    }
  }
});

test("request() still accepts a relative API path (colon in the last segment)", async () => {
  const mock = mockFetch(() => new Response(JSON.stringify({ record: {} }), { status: 200 }));
  try {
    const result = await makeClient().request("v1/records:queryRecord", { origin: "https://a.com" });
    assert.deepEqual(result, { record: {} });
    assert.equal(mock.calls[0].url, `${BASE}/v1/records:queryRecord?key=KEY`);
  } finally {
    mock.restore();
  }
});
