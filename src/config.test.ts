import { test } from "node:test";
import assert from "node:assert/strict";

import { ConfigError, loadConfig } from "./config.js";

/**
 * The reason codes below are the vocabulary the telemetry dashboard groups by —
 * renaming one silently splits a bar in two, so they are pinned here.
 */
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

test("a missing api key reports missing_api_key", () => {
  let caught: unknown;
  withEnv({ CRUX_API_KEY: undefined }, () => {
    try {
      loadConfig();
    } catch (err) {
      caught = err;
    }
  });
  assert.ok(caught instanceof ConfigError, "config problems must throw ConfigError, not exit");
  assert.equal(caught.reason, "missing_api_key");
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
