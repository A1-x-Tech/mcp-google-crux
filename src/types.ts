/**
 * The server talks to the Chrome UX Report (CrUX) API
 * (https://chromeuxreport.googleapis.com, POST /v1/records:queryRecord and
 * POST /v1/records:queryHistoryRecord). Auth is a Google Cloud API key passed
 * as the `key` query parameter — no OAuth, nothing to refresh.
 */

/** Device classes, normalized; mapped to the API's wire values by the client. */
export type FormFactor = "phone" | "desktop" | "tablet";

export interface CruxConfig {
  /**
   * Google Cloud API key (Chrome UX Report API enabled). Treated as a secret.
   * Absent when CRUX_API_KEY is not set — the server still starts (degraded)
   * and the client raises {@link CredentialsError} at call time.
   */
  apiKey?: string;
  /** API root host. Defaults to https://chromeuxreport.googleapis.com. */
  apiBase: string;
  /** Per-request timeout in milliseconds. Defaults to 30_000. */
  timeoutMs?: number;
  /** Max retries for transient errors (429 rate limit, 5xx). Defaults to 3. */
  maxRetries?: number;
  /** Base backoff in milliseconds, doubled each retry. Defaults to 500. */
  retryBaseMs?: number;
}

/** A calendar date in CrUX responses ({year, month, day}). */
export interface CruxDate {
  year?: number;
  month?: number;
  day?: number;
}

/** A 28-day collection window. Always spans 28 days, even with partial data. */
export interface CruxCollectionPeriod {
  firstDate?: CruxDate;
  lastDate?: CruxDate;
}

export interface CruxHistogramBin {
  start?: number | string;
  end?: number | string;
  density?: number;
}

/**
 * A single metric in a CrUX record. Timings are integer milliseconds, but CLS
 * is a string-encoded double ("0.05") and History timeseries mix numbers with
 * "NaN" strings and nulls for ineligible periods — parse defensively.
 */
export interface CruxMetric {
  histogram?: CruxHistogramBin[];
  percentiles?: { p75?: number | string };
  fractions?: Record<string, number>;
  histogramTimeseries?: Array<{
    start?: number | string;
    end?: number | string;
    densities?: Array<number | string | null>;
  }>;
  percentilesTimeseries?: { p75s?: Array<number | string | null> };
  fractionTimeseries?: Record<string, { fractions?: Array<number | string | null> }>;
}

export interface CruxRecord {
  key?: Record<string, unknown>;
  metrics?: Record<string, CruxMetric>;
  /** queryRecord only. */
  collectionPeriod?: CruxCollectionPeriod;
  /** queryHistoryRecord only: one entry per week, shared by all timeseries. */
  collectionPeriods?: CruxCollectionPeriod[];
}

export interface CruxResponse {
  record?: CruxRecord;
  /** Present only if the API normalized the queried URL (e.g. stripped a fragment). */
  urlNormalizationDetails?: { originalUrl?: string; normalizedUrl?: string };
}

/**
 * Raised when a tool is called while CRUX_API_KEY is missing. The message is
 * the whole point of the class: it is the only text the calling model reads
 * and relays, so it names the variable to set (and that the server needs a
 * restart) instead of describing the failure. The client throws it before the
 * URL is built — a missing key is a configuration problem, not transport
 * trouble, so it must never enter the retry/backoff loop or reach fetch.
 */
export class CredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialsError";
  }
}

/**
 * The CrUX API reports failures as a non-2xx HTTP status with the standard
 * Google error envelope ({ error: { code, message, status } }). The parsed
 * body is kept alongside the status and a short readable message is derived.
 * 429 gets an explicit quota hint: the free quota is 150 queries/min/project,
 * shared by both endpoints, with no paid upgrades.
 */
export class CruxError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, body: unknown) {
    let message = `HTTP ${status}: ${formatErrorBody(body)}`;
    if (status === 429) {
      message +=
        " — CrUX API quota exceeded: 150 queries per minute per Google Cloud project," +
        " shared by queryRecord and queryHistoryRecord (no paid upgrades)." +
        " Wait a minute and retry, or batch fewer lookups.";
    }
    super(message);
    this.name = "CruxError";
    this.status = status;
    this.body = body;
  }
}

/**
 * HTTP 404 from CrUX means "no data", not "wrong request": the origin/URL has
 * too little real-user traffic in the dataset (or the query was narrowed too
 * far, e.g. TABLET). Tools map this to a normal `{no_data: true}` result.
 */
export class CruxNoDataError extends CruxError {
  constructor(body: unknown) {
    super(404, body);
    this.name = "CruxNoDataError";
    this.message =
      "No CrUX data for this origin/URL (insufficient real-user traffic in the Chrome UX Report dataset)." +
      " Narrower queries fail first: retry without form_factor, query the origin instead of a specific URL," +
      " and make sure the URL is the final post-redirect variant (http/https and www/non-www are distinct keys).";
  }
}

/** Turns a parsed Google API error body into a short, readable message. */
function formatErrorBody(body: unknown): string {
  if (body == null) return "(no body)";
  if (typeof body === "string") return body.slice(0, 500);
  if (typeof body !== "object") return String(body);

  // Google error envelope: { error: { code, message, status } }
  const err = (body as { error?: unknown }).error;
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; message?: unknown; status?: unknown };
    if (typeof e.message === "string") {
      const status = typeof e.status === "string" ? ` (${e.status})` : "";
      return `${e.message}${status}`.slice(0, 500);
    }
  }

  return JSON.stringify(body).slice(0, 500);
}
