import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ALL_METRICS, PERCENTILE_METRICS } from "../cwv.js";
import { CruxNoDataError } from "../types.js";

/**
 * Zod schema FACTORIES (not shared consts): reusing one zod object across two
 * fields makes zod-to-json-schema dedupe them into a `$ref`, which some
 * tool-schema consumers (OpenAI Apps review) don't dereference and flag as
 * `any`. A fresh object per field keeps each one inlined with its type.
 */
export const originField = () =>
  z
    .string()
    .url()
    .optional()
    .describe(
      "Site origin — scheme + host only, e.g. https://example.com (no path, no trailing slash). " +
        "Aggregates real-user data across ALL pages of the site. Mutually exclusive with `url`. " +
        "http/https and www/non-www are distinct keys; use the canonical variant.",
    );

export const urlField = () =>
  z
    .string()
    .url()
    .optional()
    .describe(
      "A specific page URL, e.g. https://example.com/pricing/. Mutually exclusive with `origin`. " +
        "Pass the final post-redirect URL (the API does not follow redirects); fragments and query " +
        "params are stripped by the dataset. Single pages have fewer samples and often have no data — " +
        "fall back to `origin` on a no_data result.",
    );

export const formFactorField = () =>
  z
    .enum(["phone", "desktop", "tablet"])
    .optional()
    .describe(
      "Device class filter. Omit for the aggregated record across all devices. " +
        "tablet traffic is tiny and usually has no data.",
    );

export const metricsField = () =>
  z
    .array(z.enum(ALL_METRICS))
    .optional()
    .describe(
      "Metric names to return; omit for all available metrics. Timings are integer milliseconds; " +
        "cumulative_layout_shift is a string-encoded double. form_factors is only returned when " +
        "form_factor is NOT set.",
    );

export const percentileMetricsField = () =>
  z
    .array(z.enum(PERCENTILE_METRICS))
    .optional()
    .describe(
      "Metrics to trend (only p75-bearing metrics); default: the three Core Web Vitals " +
        "(largest_contentful_paint, interaction_to_next_paint, cumulative_layout_shift).",
    );

/** Wraps a value as a compact-JSON tool result (compact: the consumer is an LLM). */
export function ok(data: unknown): CallToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text", text: text ?? "null" }] };
}

export function fail(err: unknown): CallToolResult {
  let message = err instanceof Error ? err.message : String(err);
  // Surface the underlying cause (e.g. the network error behind a timeout) — no
  // secrets live in cause, and it makes failures far easier to diagnose.
  if (err instanceof Error && err.cause instanceof Error) message += ` (${err.cause.message})`;
  // Defense in depth: the API key rides in the URL (`?key=…`), so scrub any
  // key-shaped query value that found its way into an error message.
  message = message.replace(/([?&]key=)[^&\s"')]+/gi, "$1***");
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/**
 * HTTP 404 from CrUX means "no data for this origin/URL", a normal outcome —
 * tools return it as a structured result, not an error.
 */
export function noDataResult(err: CruxNoDataError): CallToolResult {
  return ok({ no_data: true, reason: err.message });
}

/** Narrowing helper for catch blocks. */
export function isNoData(err: unknown): err is CruxNoDataError {
  return err instanceof CruxNoDataError;
}

/**
 * MCP tool annotations — hints the consuming client can use to gate or label a
 * tool. Every tool here reads the CrUX dataset (the API has no write
 * endpoints), so READ_ONLY covers all of them.
 */
// All four hints set explicitly: some clients (OpenAI Apps review) require readOnlyHint,
// destructiveHint and openWorldHint on every tool. Read-only tools never mutate, so they
// are non-destructive and idempotent (re-reading yields the same result).
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
