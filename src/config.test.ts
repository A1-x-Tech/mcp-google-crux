import { test } from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "./config.js";

function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const saved = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    run();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/**
 * A missing CRUX_API_KEY used to throw, which killed the process before the
 * MCP handshake and left the user with a dead server and no reason. It is now
 * a survivable state: the server starts, answers initialize/tools/list, and
 * the client raises CredentialsError at call time (pinned in client.test.ts).
 * Pinned here because reverting it would restore that dead end.
 */
test("a missing api key does not throw — the server must start degraded", () => {
  withEnv({ CRUX_API_KEY: undefined, CRUX_API_BASE: undefined }, () => {
    const config = loadConfig();
    assert.equal(config.apiKey, undefined);
    assert.equal(config.apiBase, "https://chromeuxreport.googleapis.com");
  });
});

test("an empty value is treated as absent, not as an empty credential", () => {
  withEnv({ CRUX_API_KEY: "" }, () => {
    assert.equal(loadConfig().apiKey, undefined);
  });
});

test("a configured server loads with sane defaults", () => {
  withEnv(
    { CRUX_API_KEY: "key", CRUX_API_BASE: undefined, CRUX_TIMEOUT_MS: undefined, CRUX_MAX_RETRIES: undefined },
    () => {
      const config = loadConfig();
      assert.equal(config.apiKey, "key");
      assert.equal(config.apiBase, "https://chromeuxreport.googleapis.com");
      assert.equal(config.timeoutMs, 30_000);
      assert.equal(config.maxRetries, 3);
    },
  );
});

test("optional variables override the defaults", () => {
  withEnv(
    {
      CRUX_API_KEY: "key",
      CRUX_API_BASE: "https://proxy.example",
      CRUX_TIMEOUT_MS: "5000",
      CRUX_MAX_RETRIES: "0",
    },
    () => {
      const config = loadConfig();
      assert.equal(config.apiBase, "https://proxy.example");
      assert.equal(config.timeoutMs, 5000);
      assert.equal(config.maxRetries, 0);
    },
  );
});

test("malformed numbers fall back to the defaults silently", () => {
  withEnv({ CRUX_API_KEY: "key", CRUX_TIMEOUT_MS: "soon", CRUX_MAX_RETRIES: "-2" }, () => {
    const config = loadConfig();
    assert.equal(config.timeoutMs, 30_000);
    assert.equal(config.maxRetries, 3);
  });
});
