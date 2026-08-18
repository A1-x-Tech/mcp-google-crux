import type { CruxConfig, CruxResponse, FormFactor } from "./types.js";
import { CredentialsError, CruxError, CruxNoDataError } from "./types.js";

/**
 * Call-time text for a missing API key — formerly the startup error that
 * killed the process before the MCP handshake, preserved verbatim (pinned in
 * client.test.ts). The message is the product: it is what the calling model
 * relays to the user, so it names the variable to set and says the server
 * needs a restart — there is no in-chat login for an API key.
 */
const MISSING_API_KEY_MESSAGE =
  "CRUX_API_KEY is required (a Google Cloud API key with the Chrome UX Report API enabled; " +
  "create one at https://console.cloud.google.com/apis/credentials)." +
  " This is not a network failure and retrying will not help: the operator must set this " +
  "environment variable in the MCP client's server config and restart the server — it is " +
  "read only at startup.";

/** Normalized inputs shared by both endpoints. Exactly one of origin/url. */
export interface QueryRecordParams {
  /** Site origin (scheme + host), aggregates all pages. XOR with url. */
  origin?: string;
  /** A specific page URL (fewer samples, more likely to have no data). XOR with origin. */
  url?: string;
  /** Device class filter; omitted = the aggregated all-devices record. */
  formFactor?: FormFactor;
  /** Metric names to return; omitted = all available metrics. */
  metrics?: string[];
}

export interface QueryHistoryParams extends QueryRecordParams {
  /** How many weekly collection periods to return (1..40, API default 25). */
  collectionPeriodCount?: number;
}

/** Maps a normalized form factor to the API's wire value. */
function mapFormFactor(f: FormFactor): string {
  return { phone: "PHONE", desktop: "DESKTOP", tablet: "TABLET" }[f];
}

export class CruxClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;

  constructor(private readonly config: CruxConfig) {
    this.base = config.apiBase.endsWith("/") ? config.apiBase : config.apiBase + "/";
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseMs = config.retryBaseMs ?? 500;
  }

  /** Backoff before a retry: honors Retry-After when present, else exponential (capped at 30s). */
  private backoffMs(attempt: number, res?: Response): number {
    const retryAfter = res ? Number(res.headers.get("Retry-After")) : NaN;
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 30) * 1000;
    return Math.min(this.retryBaseMs * 2 ** attempt, 30_000);
  }

  /**
   * fetch with an AbortController timeout. Reads the response body inside the
   * guarded zone so the timeout also covers a slow or drip-feeding body, not
   * just the initial headers. `label` is the API path WITHOUT the key query
   * parameter, so a timeout message can never leak the key.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<{ res: Response; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      return { res, text };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request to "${label}" timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Low-level request to a CrUX path (e.g. "v1/records:queryRecord"). The API
   * is POST-only (GET answers with a misleading 404), so the method is fixed.
   * A missing API key throws {@link CredentialsError} before anything else.
   * The API key rides as the `key` query parameter and never appears in error
   * messages. Retries 429, 5xx and network errors/timeouts with backoff; 404
   * throws {@link CruxNoDataError} ("no data", a normal outcome); any other
   * non-2xx throws a {@link CruxError}.
   */
  async request<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    // A missing API key is rejected before the URL is built, the request sent
    // or retried: it is a configuration problem, not transport trouble, so it
    // must never enter the retry/backoff loop below — and fetch never fires
    // without auth (pinned in client.test.ts).
    const apiKey = this.config.apiKey;
    if (!apiKey) throw new CredentialsError(MISSING_API_KEY_MESSAGE);

    // Resolve the path against the API base, then reject anything that escaped
    // to a foreign origin so the API key can never ride to another host.
    const url = new URL(path.replace(/^\//, ""), this.base);
    if (url.origin !== new URL(this.base).origin) {
      throw new Error(`path must be a relative API path (resolved to foreign origin ${url.origin})`);
    }
    url.searchParams.set("key", apiKey);
    const target = url.toString();

    // The CrUX API is read-only — both endpoints are side-effect-free POSTs,
    // so every request is safe to retry. (A write API must gate 5xx/network
    // retries to idempotent methods — see the sibling servers.)
    const idempotent = true;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      let text: string;
      try {
        ({ res, text } = await this.fetchWithTimeout(
          target,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
          },
          path,
        ));
      } catch (err) {
        // Network error or timeout: retry with backoff; on the last attempt
        // rethrow the original error.
        if (idempotent && attempt < this.maxRetries) {
          await delay(this.backoffMs(attempt));
          continue;
        }
        throw err;
      }

      const transient = res.status === 429 || (idempotent && res.status >= 500 && res.status < 600);
      if (transient && attempt < this.maxRetries) {
        await delay(this.backoffMs(attempt, res));
        continue;
      }

      let data: unknown = undefined;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      // 404 is a documented "no data" answer, not a failure — surface it as
      // its own error type so tools can turn it into a normal result.
      if (res.status === 404) throw new CruxNoDataError(data);
      if (!res.ok) throw new CruxError(res.status, data);
      return data as T;
    }
  }

  /** Ensures exactly one of origin/url is present (the API 400s otherwise). */
  private assertSubject(p: { origin?: string; url?: string }): void {
    if (!p.origin === !p.url) {
      throw new Error(
        "Provide exactly one of `origin` or `url` — they are mutually exclusive" +
          " (origin = whole site, url = a single page).",
      );
    }
  }

  /** Latest 28-day rolling record (updated daily around 04:00 UTC). */
  async queryRecord(p: QueryRecordParams): Promise<CruxResponse> {
    this.assertSubject(p);
    return this.request("v1/records:queryRecord", compact({
      origin: p.origin,
      url: p.url,
      formFactor: p.formFactor ? mapFormFactor(p.formFactor) : undefined,
      metrics: p.metrics,
    }));
  }

  /** Weekly timeseries of up to 40 collection periods (updated Mondays). */
  async queryHistoryRecord(p: QueryHistoryParams): Promise<CruxResponse> {
    this.assertSubject(p);
    return this.request("v1/records:queryHistoryRecord", compact({
      origin: p.origin,
      url: p.url,
      formFactor: p.formFactor ? mapFormFactor(p.formFactor) : undefined,
      metrics: p.metrics,
      collectionPeriodCount: p.collectionPeriodCount,
    }));
  }
}

/** Drops keys whose value is `undefined` so they are not sent to the API. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
