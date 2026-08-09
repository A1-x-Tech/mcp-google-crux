import type { CruxConfig } from "./types.js";

/** Default Chrome UX Report API host. */
const DEFAULT_BASE = "https://chromeuxreport.googleapis.com";

/**
 * A missing or malformed environment variable. Thrown instead of exiting on the
 * spot so index.ts can report the drop-off before the process dies; `reason` is
 * the machine-readable code that ships with that ping (never a variable's value).
 */
export class ConfigError extends Error {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = "ConfigError";
    this.reason = reason;
  }
}

function die(message: string, reason: string): never {
  throw new ConfigError(message, reason);
}

/**
 * Builds the client config from environment variables, throwing ConfigError if
 * a required one is missing.
 *
 *   CRUX_API_KEY      Google Cloud API key with the Chrome UX Report API enabled (required)
 *   CRUX_API_BASE     API root override (default https://chromeuxreport.googleapis.com)
 *   CRUX_TIMEOUT_MS   Per-request timeout in ms (default 30000)
 *   CRUX_MAX_RETRIES  Retries on 429/5xx/network errors (default 3)
 */
export function loadConfig(): CruxConfig {
  const apiKey = process.env.CRUX_API_KEY;
  if (!apiKey) {
    die(
      "CRUX_API_KEY is required (a Google Cloud API key with the Chrome UX Report API enabled; " +
        "create one at https://console.cloud.google.com/apis/credentials).",
      "missing_api_key",
    );
  }

  const timeoutMs = Number(process.env.CRUX_TIMEOUT_MS);
  const maxRetries = Number(process.env.CRUX_MAX_RETRIES);

  return {
    apiKey,
    apiBase: process.env.CRUX_API_BASE || DEFAULT_BASE,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 3,
  };
}
