import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CruxClient, QueryRecordParams } from "../client.js";
import type { CruxResponse } from "../types.js";
import {
  ASSESSMENT_METRICS,
  CWV_METRICS,
  metricTrend,
  passesCoreWebVitals,
  periodOf,
  summarizeMetrics,
} from "../cwv.js";
import {
  fail,
  formFactorField,
  isNoData,
  metricsField,
  noDataResult,
  ok,
  originField,
  percentileMetricsField,
  READ_ONLY,
  urlField,
} from "./util.js";

/** Runs a queryRecord, mapping the "no data" 404 to null instead of throwing. */
async function recordOrNull(client: CruxClient, p: QueryRecordParams): Promise<CruxResponse | null> {
  try {
    return await client.queryRecord(p);
  } catch (e) {
    if (isNoData(e)) return null;
    throw e;
  }
}

/** p75 + rating summary of one response (or a no_data marker). */
function summarize(res: CruxResponse | null): Record<string, unknown> {
  if (!res) return { no_data: true };
  return {
    metrics: summarizeMetrics(res.record?.metrics),
    collection_period: periodOf(res.record?.collectionPeriod),
  };
}

/**
 * Convenience tools computed on top of the raw records: CWV assessment,
 * device breakdown, origin-vs-page comparison and the p75 trend.
 */
export function registerVitalsTools(server: McpServer, client: CruxClient): void {
  server.registerTool(
    "get_core_web_vitals",
    {
      title: "Core Web Vitals assessment",
      annotations: READ_ONLY,
      description:
        "One-call Core Web Vitals assessment for an origin or URL over the latest 28-day window. Per " +
        "metric (LCP, INP, CLS + diagnostic FCP and TTFB): p75, rating (good | needs-improvement | poor, " +
        "web.dev thresholds: LCP ≤2500ms/>4000ms, INP ≤200ms/>500ms, CLS ≤0.10/>0.25) and the " +
        "good/needs_improvement/poor user-experience densities (~sum 1.0). `passes_core_web_vitals` is " +
        "true when all three CWV rate good. Timings are ms; CLS is unitless. Returns {no_data: true} when " +
        "the origin/URL has insufficient traffic in CrUX. Provide exactly one of `origin` or `url`.",
      inputSchema: {
        origin: originField(),
        url: urlField(),
        form_factor: formFactorField(),
      },
    },
    async ({ origin, url, form_factor }) => {
      try {
        const res = await client.queryRecord({
          origin,
          url,
          formFactor: form_factor,
          metrics: [...ASSESSMENT_METRICS],
        });
        const metrics = summarizeMetrics(res.record?.metrics);
        return ok({
          queried: origin ?? url,
          form_factor: form_factor ?? "all",
          collection_period: periodOf(res.record?.collectionPeriod),
          metrics,
          passes_core_web_vitals: passesCoreWebVitals(metrics),
          url_normalization: res.urlNormalizationDetails,
        });
      } catch (e) {
        if (isNoData(e)) return noDataResult(e);
        return fail(e);
      }
    },
  );

  server.registerTool(
    "compare_form_factors",
    {
      title: "Phone vs desktop vs tablet",
      annotations: READ_ONLY,
      description:
        "Compares real-user performance across device classes for an origin or URL: one aggregated " +
        "all-devices record plus phone, desktop and tablet records (4 API requests = 4 quota units of the " +
        "150/min budget). Per device: p75 + rating per metric; `traffic_share` gives each device's " +
        "fraction of page loads (from the unfiltered form_factors metric). Devices without enough data " +
        "come back as {no_data: true} — expected for tablet almost always. Default metrics: the three " +
        "Core Web Vitals. Provide exactly one of `origin` or `url`.",
      inputSchema: {
        origin: originField(),
        url: urlField(),
        metrics: metricsField(),
      },
    },
    async ({ origin, url, metrics }) => {
      try {
        const chosen: string[] = metrics ?? [...CWV_METRICS];
        // form_factors (traffic shares) is only returned on unfiltered queries.
        const aggregate = chosen.includes("form_factors") ? chosen : [...chosen, "form_factors"];
        const subject = { origin, url };
        const [all, phone, desktop, tablet] = await Promise.all([
          recordOrNull(client, { ...subject, metrics: aggregate }),
          recordOrNull(client, { ...subject, formFactor: "phone", metrics: chosen }),
          recordOrNull(client, { ...subject, formFactor: "desktop", metrics: chosen }),
          recordOrNull(client, { ...subject, formFactor: "tablet", metrics: chosen }),
        ]);
        if (!all && !phone && !desktop && !tablet) {
          return ok({
            no_data: true,
            reason:
              "No CrUX data for this origin/URL on any form factor (insufficient real-user traffic).",
          });
        }
        return ok({
          queried: origin ?? url,
          metrics_compared: chosen,
          traffic_share: all?.record?.metrics?.form_factors?.fractions,
          form_factors: {
            all: summarize(all),
            phone: summarize(phone),
            desktop: summarize(desktop),
            tablet: summarize(tablet),
          },
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "compare_origin_vs_url",
    {
      title: "Origin vs specific page",
      annotations: READ_ONLY,
      description:
        "Compares the site-wide origin record against one specific page (2 API requests): p75 + rating " +
        "per metric for each, so you can tell whether a page is faster or slower than the site average. " +
        "Either side can come back {no_data: true} (single pages often lack data; redirecting homepages " +
        "can lack origin data while pages have it). Default metrics: the three Core Web Vitals. Both " +
        "`origin` AND `url` are required here (unlike the other tools).",
      inputSchema: {
        origin: z
          .string()
          .url()
          .describe("Site origin — scheme + host only, e.g. https://example.com. Required."),
        url: z
          .string()
          .url()
          .describe("The page URL to compare against the origin, e.g. https://example.com/pricing/. Required."),
        form_factor: formFactorField(),
        metrics: metricsField(),
      },
    },
    async ({ origin, url, form_factor, metrics }) => {
      try {
        const chosen: string[] = metrics ?? [...CWV_METRICS];
        const [o, u] = await Promise.all([
          recordOrNull(client, { origin, formFactor: form_factor, metrics: chosen }),
          recordOrNull(client, { url, formFactor: form_factor, metrics: chosen }),
        ]);
        return ok({
          form_factor: form_factor ?? "all",
          metrics_compared: chosen,
          origin: { queried: origin, ...summarize(o) },
          url: {
            queried: url,
            ...summarize(u),
            url_normalization: u?.urlNormalizationDetails,
          },
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_cwv_trend",
    {
      title: "Core Web Vitals trend",
      annotations: READ_ONLY,
      description:
        "Weekly p75 trend for an origin or URL from the CrUX History API (1 request). Per metric: " +
        "`points` — array of {period_end, p75, rating}, one per week (each week is a 28-day rolling " +
        "window ending on period_end; ineligible weeks are skipped), and `delta` — first vs last p75 with " +
        "direction improved | regressed | stable (lower is always better). Default metrics: the three " +
        "Core Web Vitals; `weeks` caps the history depth (1..40, default 25). History data updates on " +
        "Mondays. Returns {no_data: true} when CrUX has no data. Provide exactly one of `origin` or `url`.",
      inputSchema: {
        origin: originField(),
        url: urlField(),
        form_factor: formFactorField(),
        metrics: percentileMetricsField(),
        weeks: z
          .number()
          .int()
          .min(1)
          .max(40)
          .optional()
          .describe("How many weekly periods of history to analyze (1..40; default 25)."),
      },
    },
    async ({ origin, url, form_factor, metrics, weeks }) => {
      try {
        const chosen: string[] = metrics ?? [...CWV_METRICS];
        const res = await client.queryHistoryRecord({
          origin,
          url,
          formFactor: form_factor,
          metrics: chosen,
          collectionPeriodCount: weeks,
        });
        const periods = res.record?.collectionPeriods ?? [];
        const trends: Record<string, unknown> = {};
        for (const [name, series] of Object.entries(res.record?.metrics ?? {})) {
          if (!series.percentilesTimeseries) continue;
          trends[name] = metricTrend(name, series, periods);
        }
        return ok({
          queried: origin ?? url,
          form_factor: form_factor ?? "all",
          weeks_returned: periods.length,
          metrics: trends,
        });
      } catch (e) {
        if (isNoData(e)) return noDataResult(e);
        return fail(e);
      }
    },
  );
}
