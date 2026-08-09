import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_METRICS,
  ASSESSMENT_METRICS,
  CWV_METRICS,
  dateOf,
  metricTrend,
  num,
  passesCoreWebVitals,
  periodOf,
  rate,
  summarizeMetrics,
} from "./cwv.js";

test("num parses numbers and numeric strings, rejects null/NaN/junk", () => {
  assert.equal(num(1362), 1362);
  assert.equal(num("0.05"), 0.05); // CLS is a string-encoded double
  assert.equal(num("12"), 12);
  assert.equal(num(null), null);
  assert.equal(num(undefined), null);
  assert.equal(num("NaN"), null); // History API emits "NaN" strings
  assert.equal(num("fast"), null);
});

test("rate applies the web.dev thresholds at their exact boundaries", () => {
  assert.equal(rate("largest_contentful_paint", 2500), "good");
  assert.equal(rate("largest_contentful_paint", 2501), "needs-improvement");
  assert.equal(rate("largest_contentful_paint", 4000), "needs-improvement");
  assert.equal(rate("largest_contentful_paint", 4001), "poor");
  assert.equal(rate("interaction_to_next_paint", 200), "good");
  assert.equal(rate("interaction_to_next_paint", 500), "needs-improvement");
  assert.equal(rate("interaction_to_next_paint", 501), "poor");
  assert.equal(rate("cumulative_layout_shift", 0.1), "good");
  assert.equal(rate("cumulative_layout_shift", 0.25), "needs-improvement");
  assert.equal(rate("cumulative_layout_shift", 0.26), "poor");
});

test("rate returns null for unrateable metrics and missing values", () => {
  assert.equal(rate("round_trip_time", 100), null); // no official threshold
  assert.equal(rate("largest_contentful_paint", null), null);
  assert.equal(rate("unknown_metric", 1), null);
});

test("dateOf and periodOf format CrUX dates as YYYY-MM-DD", () => {
  assert.equal(dateOf({ year: 2026, month: 8, day: 6 }), "2026-08-06");
  assert.equal(dateOf(undefined), null);
  assert.deepEqual(periodOf({ firstDate: { year: 2026, month: 7, day: 10 }, lastDate: { year: 2026, month: 8, day: 6 } }), {
    first_date: "2026-07-10",
    last_date: "2026-08-06",
  });
  assert.equal(periodOf(undefined), null);
});

test("summarizeMetrics: p75 + rating + densities; CLS string decoded; fraction metrics skipped", () => {
  const summaries = summarizeMetrics({
    largest_contentful_paint: {
      histogram: [
        { start: 0, end: 2500, density: 0.9 },
        { start: 2500, end: 4000, density: 0.07 },
        { start: 4000, density: 0.03 },
      ],
      percentiles: { p75: 1362 },
    },
    cumulative_layout_shift: {
      histogram: [
        { start: "0.00", end: "0.10", density: 0.95 },
        { start: "0.10", end: "0.25", density: 0.04 },
        { start: "0.25", density: 0.01 },
      ],
      percentiles: { p75: "0.05" },
    },
    form_factors: { fractions: { phone: 0.6, desktop: 0.38, tablet: 0.02 } },
  });

  assert.deepEqual(Object.keys(summaries).sort(), ["cumulative_layout_shift", "largest_contentful_paint"]);
  assert.equal(summaries.largest_contentful_paint.p75, 1362);
  assert.equal(summaries.largest_contentful_paint.rating, "good");
  assert.deepEqual(summaries.largest_contentful_paint.densities, {
    good: 0.9,
    needs_improvement: 0.07,
    poor: 0.03,
  });
  assert.equal(summaries.cumulative_layout_shift.p75, 0.05);
  assert.equal(summaries.cumulative_layout_shift.rating, "good");
});

test("passesCoreWebVitals: all good → true, any worse → false, none present → null", () => {
  const good = { p75: 1, rating: "good" as const };
  assert.equal(
    passesCoreWebVitals({
      largest_contentful_paint: good,
      interaction_to_next_paint: good,
      cumulative_layout_shift: good,
    }),
    true,
  );
  assert.equal(
    passesCoreWebVitals({
      largest_contentful_paint: good,
      interaction_to_next_paint: { p75: 600, rating: "poor" },
    }),
    false,
  );
  assert.equal(passesCoreWebVitals({ first_contentful_paint: good }), null);
});

test("metricTrend skips null/NaN points and reports the first-vs-last delta", () => {
  const periods = [
    { lastDate: { year: 2026, month: 5, day: 2 } },
    { lastDate: { year: 2026, month: 5, day: 9 } },
    { lastDate: { year: 2026, month: 5, day: 16 } },
    { lastDate: { year: 2026, month: 5, day: 23 } },
  ];
  const { points, delta } = metricTrend(
    "largest_contentful_paint",
    { percentilesTimeseries: { p75s: [1362, "NaN", null, 1200] } },
    periods,
  );
  assert.deepEqual(points, [
    { period_end: "2026-05-02", p75: 1362, rating: "good" },
    { period_end: "2026-05-23", p75: 1200, rating: "good" },
  ]);
  assert.deepEqual(delta, { first_p75: 1362, last_p75: 1200, change: -162, direction: "improved" });
});

test("metricTrend: a single surviving point has no delta; regression is flagged", () => {
  const periods = [{ lastDate: { year: 2026, month: 5, day: 2 } }, { lastDate: { year: 2026, month: 5, day: 9 } }];
  assert.equal(
    metricTrend("cumulative_layout_shift", { percentilesTimeseries: { p75s: ["0.05", null] } }, periods).delta,
    null,
  );
  const { delta } = metricTrend(
    "cumulative_layout_shift",
    { percentilesTimeseries: { p75s: ["0.05", "0.30"] } },
    periods,
  );
  assert.deepEqual(delta, { first_p75: 0.05, last_p75: 0.3, change: 0.25, direction: "regressed" });
});

test("metric vocabulary: FID stays out; CWV ⊂ assessment ⊂ all", () => {
  assert.ok(!ALL_METRICS.includes("first_input_delay" as never), "FID was removed from the API");
  for (const m of CWV_METRICS) assert.ok((ASSESSMENT_METRICS as readonly string[]).includes(m));
  for (const m of ASSESSMENT_METRICS) assert.ok((ALL_METRICS as readonly string[]).includes(m));
});
