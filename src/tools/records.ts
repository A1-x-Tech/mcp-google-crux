import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CruxClient } from "../client.js";
import { fail, formFactorField, isNoData, metricsField, noDataResult, ok, originField, READ_ONLY, urlField } from "./util.js";

/**
 * Raw pass-through tools for the two CrUX endpoints. Responses are returned
 * verbatim; the response format is described in each tool's description (the
 * only place the consuming LLM reads).
 */
export function registerRecordTools(server: McpServer, client: CruxClient): void {
  server.registerTool(
    "query_record",
    {
      title: "Latest CrUX record (raw)",
      annotations: READ_ONLY,
      description:
        "Returns the latest 28-day rolling CrUX record for an origin or URL (raw API response, updated " +
        "daily ~04:00 UTC). Per metric: `histogram` (3 bins good/needs-improvement/poor with `density`), " +
        "`percentiles.p75`, and for enum metrics `fractions`. Timings are integer ms; " +
        "cumulative_layout_shift p75 is a string-encoded double (e.g. \"0.05\"). `collectionPeriod` always " +
        "spans 28 days. `urlNormalizationDetails` appears if the URL was normalized (e.g. fragment " +
        "stripped). A no-data answer (HTTP 404) is returned as {no_data: true} — not an error. Prefer " +
        "get_core_web_vitals for a ready-made assessment; use this for full histograms/fractions.",
      inputSchema: {
        origin: originField(),
        url: urlField(),
        form_factor: formFactorField(),
        metrics: metricsField(),
      },
    },
    async ({ origin, url, form_factor, metrics }) => {
      try {
        return ok(await client.queryRecord({ origin, url, formFactor: form_factor, metrics }));
      } catch (e) {
        if (isNoData(e)) return noDataResult(e);
        return fail(e);
      }
    },
  );

  server.registerTool(
    "query_history_record",
    {
      title: "CrUX weekly timeseries (raw)",
      annotations: READ_ONLY,
      description:
        "Returns the weekly CrUX timeseries for an origin or URL (raw API response, updated Mondays " +
        "~04:00 UTC): up to 40 collection periods, each a 28-day rolling window. Per metric: " +
        "`histogramTimeseries` (bins with `densities` arrays), `percentilesTimeseries.p75s` and " +
        "`fractionTimeseries`; all series align with `record.collectionPeriods`. Ineligible periods " +
        "appear as null p75s and \"NaN\" densities — tolerate non-numeric entries. A no-data answer " +
        "(HTTP 404) is returned as {no_data: true}. Prefer get_cwv_trend for a cleaned p75 trend.",
      inputSchema: {
        origin: originField(),
        url: urlField(),
        form_factor: formFactorField(),
        metrics: metricsField(),
        collection_period_count: z
          .number()
          .int()
          .min(1)
          .max(40)
          .optional()
          .describe("How many weekly collection periods to return (1..40; API default 25)."),
      },
    },
    async ({ origin, url, form_factor, metrics, collection_period_count }) => {
      try {
        return ok(
          await client.queryHistoryRecord({
            origin,
            url,
            formFactor: form_factor,
            metrics,
            collectionPeriodCount: collection_period_count,
          }),
        );
      } catch (e) {
        if (isNoData(e)) return noDataResult(e);
        return fail(e);
      }
    },
  );
}
