import { test } from "node:test";
import assert from "node:assert/strict";
import { registerVitalsTools } from "./vitals.js";
import type { CruxResponse } from "../types.js";
import { CruxNoDataError } from "../types.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;
type RecordedCall = { method: string; params: Record<string, unknown> };

const PERIOD = {
  firstDate: { year: 2026, month: 7, day: 10 },
  lastDate: { year: 2026, month: 8, day: 6 },
};

/** A healthy record with the three CWV + diagnostics, CLS string-encoded. */
function goodRecord(extraMetrics: Record<string, unknown> = {}): CruxResponse {
  return {
    record: {
      key: {},
      metrics: {
        largest_contentful_paint: {
          histogram: [
            { start: 0, end: 2500, density: 0.9 },
            { start: 2500, end: 4000, density: 0.07 },
            { start: 4000, density: 0.03 },
          ],
          percentiles: { p75: 1362 },
        },
        interaction_to_next_paint: { percentiles: { p75: 150 } },
        cumulative_layout_shift: { percentiles: { p75: "0.05" } },
        first_contentful_paint: { percentiles: { p75: 1200 } },
        experimental_time_to_first_byte: { percentiles: { p75: 500 } },
        ...extraMetrics,
      },
      collectionPeriod: PERIOD,
    },
  } as CruxResponse;
}

/** Fake server + fake client; `respond` decides per-call what to return/throw. */
function harness(respond: (method: string, params: Record<string, unknown>) => CruxResponse) {
  const calls: RecordedCall[] = [];
  const client = {
    queryRecord: async (params: Record<string, unknown>) => {
      calls.push({ method: "queryRecord", params });
      return respond("queryRecord", params);
    },
    queryHistoryRecord: async (params: Record<string, unknown>) => {
      calls.push({ method: "queryHistoryRecord", params });
      return respond("queryHistoryRecord", params);
    },
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerVitalsTools(server as never, client as never);
  return { calls, tools };
}

function parse(res: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(res.content[0].text);
}

test("registers the four convenience tools", () => {
  const { tools } = harness(() => goodRecord());
  assert.deepEqual(Object.keys(tools).sort(), [
    "compare_form_factors",
    "compare_origin_vs_url",
    "get_core_web_vitals",
    "get_cwv_trend",
  ]);
});

test("get_core_web_vitals: one call, assessment metrics, ratings and pass verdict", async () => {
  const { calls, tools } = harness(() => goodRecord());
  const res = await tools.get_core_web_vitals({ origin: "https://example.com", form_factor: "phone" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "queryRecord");
  assert.deepEqual(calls[0].params, {
    origin: "https://example.com",
    url: undefined,
    formFactor: "phone",
    metrics: [
      "largest_contentful_paint",
      "interaction_to_next_paint",
      "cumulative_layout_shift",
      "first_contentful_paint",
      "experimental_time_to_first_byte",
    ],
  });

  const body = parse(res);
  assert.equal(body.queried, "https://example.com");
  assert.equal(body.form_factor, "phone");
  assert.equal(body.passes_core_web_vitals, true);
  const metrics = body.metrics as Record<string, { p75: number; rating: string }>;
  assert.equal(metrics.largest_contentful_paint.rating, "good");
  assert.equal(metrics.cumulative_layout_shift.p75, 0.05, "CLS string must be decoded to a number");
  assert.deepEqual(body.collection_period, { first_date: "2026-07-10", last_date: "2026-08-06" });
});

test("get_core_web_vitals maps a 404 to {no_data: true}", async () => {
  const { tools } = harness(() => {
    throw new CruxNoDataError({});
  });
  const res = await tools.get_core_web_vitals({ url: "https://tiny.example/page" });
  assert.equal(res.isError, undefined);
  assert.equal(parse(res).no_data, true);
});

test("compare_form_factors: 4 requests, traffic shares, tablet 404 tolerated", async () => {
  const { calls, tools } = harness((_method, params) => {
    if (params.formFactor === "tablet") throw new CruxNoDataError({});
    if (params.formFactor === undefined) {
      return goodRecord({ form_factors: { fractions: { phone: 0.6, desktop: 0.38, tablet: 0.02 } } });
    }
    return goodRecord();
  });
  const res = await tools.compare_form_factors({ origin: "https://example.com" });

  assert.equal(calls.length, 4, "consumes 4 quota units: all + phone + desktop + tablet");
  const aggregate = calls.find((c) => c.params.formFactor === undefined);
  assert.ok(aggregate, "one request must be unfiltered for the form_factors shares");
  assert.deepEqual(aggregate.params.metrics, [
    "largest_contentful_paint",
    "interaction_to_next_paint",
    "cumulative_layout_shift",
    "form_factors",
  ]);
  const phone = calls.find((c) => c.params.formFactor === "phone");
  assert.deepEqual(phone?.params.metrics, [
    "largest_contentful_paint",
    "interaction_to_next_paint",
    "cumulative_layout_shift",
  ]);

  const body = parse(res);
  assert.deepEqual(body.traffic_share, { phone: 0.6, desktop: 0.38, tablet: 0.02 });
  const ff = body.form_factors as Record<string, Record<string, unknown>>;
  assert.equal(ff.tablet.no_data, true, "tablet without data must not fail the whole tool");
  assert.ok(ff.phone.metrics, "phone summary present");
});

test("compare_form_factors: all four without data collapses to one no_data result", async () => {
  const { tools } = harness(() => {
    throw new CruxNoDataError({});
  });
  const body = parse(await tools.compare_form_factors({ origin: "https://tiny.example" }));
  assert.equal(body.no_data, true);
});

test("compare_origin_vs_url: two requests, page no_data tolerated", async () => {
  const { calls, tools } = harness((_method, params) => {
    if (params.url) throw new CruxNoDataError({});
    return goodRecord();
  });
  const res = await tools.compare_origin_vs_url({
    origin: "https://example.com",
    url: "https://example.com/pricing/",
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].params.origin, "https://example.com");
  assert.equal(calls[1].params.url, "https://example.com/pricing/");

  const body = parse(res);
  const origin = body.origin as Record<string, unknown>;
  const url = body.url as Record<string, unknown>;
  assert.ok(origin.metrics, "origin side summarized");
  assert.equal(url.no_data, true, "page side reports no_data");
});

test("get_cwv_trend: weeks maps to collectionPeriodCount; series cleaned and rated", async () => {
  const history: CruxResponse = {
    record: {
      key: {},
      metrics: {
        largest_contentful_paint: { percentilesTimeseries: { p75s: [2600, "NaN", 2400] } },
        cumulative_layout_shift: { percentilesTimeseries: { p75s: ["0.05", "0.06", "0.30"] } },
      },
      collectionPeriods: [
        { firstDate: { year: 2026, month: 4, day: 5 }, lastDate: { year: 2026, month: 5, day: 2 } },
        { firstDate: { year: 2026, month: 4, day: 12 }, lastDate: { year: 2026, month: 5, day: 9 } },
        { firstDate: { year: 2026, month: 4, day: 19 }, lastDate: { year: 2026, month: 5, day: 16 } },
      ],
    },
  } as CruxResponse;

  const { calls, tools } = harness(() => history);
  const res = await tools.get_cwv_trend({ origin: "https://example.com", weeks: 3 });

  assert.equal(calls[0].method, "queryHistoryRecord");
  assert.deepEqual(calls[0].params, {
    origin: "https://example.com",
    url: undefined,
    formFactor: undefined,
    metrics: ["largest_contentful_paint", "interaction_to_next_paint", "cumulative_layout_shift"],
    collectionPeriodCount: 3,
  });

  const body = parse(res);
  assert.equal(body.weeks_returned, 3);
  const metrics = body.metrics as Record<
    string,
    { points: { period_end: string; p75: number; rating: string | null }[]; delta: Record<string, unknown> | null }
  >;
  assert.deepEqual(metrics.largest_contentful_paint.points, [
    { period_end: "2026-05-02", p75: 2600, rating: "needs-improvement" },
    { period_end: "2026-05-16", p75: 2400, rating: "good" },
  ]);
  assert.deepEqual(metrics.largest_contentful_paint.delta, {
    first_p75: 2600,
    last_p75: 2400,
    change: -200,
    direction: "improved",
  });
  assert.equal(metrics.cumulative_layout_shift.delta?.direction, "regressed");
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness(() => {
    throw new Error("boom");
  });
  for (const call of [
    () => tools.get_core_web_vitals({ origin: "https://example.com" }),
    () => tools.compare_form_factors({ origin: "https://example.com" }),
    () => tools.compare_origin_vs_url({ origin: "https://example.com", url: "https://example.com/x" }),
    () => tools.get_cwv_trend({ origin: "https://example.com" }),
  ]) {
    const res = await call();
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /boom/);
  }
});
