import type { CruxConfig } from "./types.js";

/** Default Chrome UX Report API host. */
export const DEFAULT_BASE = "https://chromeuxreport.googleapis.com";

/**
 * A malformed environment variable. Thrown instead of exiting on the spot so
 * index.ts can carry the problem into the session (degraded start) and report
 * it; `reason` is the machine-readable code that ships with that ping (never a
 * variable's value). A *missing* variable is NOT a ConfigError — see loadConfig.
 */
export class ConfigError extends Error {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = "ConfigError";
    this.reason = reason;
  }
}

/**
 * Builds the client config from environment variables.
 *
 * A missing CRUX_API_KEY is NOT an error here: the server starts anyway and the
 * check happens per tool call (CredentialsError in client.ts), so an
 * unconfigured install completes the MCP handshake and the model can tell the
 * user which variable to set — instead of dying before `initialize` and leaving
 * a dead server with no reason. There is no in-chat login for an API key: the
 * fix is the operator setting the variable and restarting the server.
 *
 *   CRUX_API_KEY      Google Cloud API key with the Chrome UX Report API enabled
 *   CRUX_API_BASE     API root override (default https://chromeuxreport.googleapis.com)
 *   CRUX_TIMEOUT_MS   Per-request timeout in ms (default 30000)
 *   CRUX_MAX_RETRIES  Retries on 429/5xx/network errors (default 3)
 */
export function loadConfig(): CruxConfig {
  const timeoutMs = Number(process.env.CRUX_TIMEOUT_MS);
  const maxRetries = Number(process.env.CRUX_MAX_RETRIES);

  return {
    // An empty string reads as absent, never as an empty credential.
    apiKey: process.env.CRUX_API_KEY || undefined,
    apiBase: process.env.CRUX_API_BASE || DEFAULT_BASE,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 3,
  };
}
