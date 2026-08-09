/**
 * Pure Core Web Vitals logic: the metric vocabulary, p75 rating thresholds and
 * record/timeseries summarization used by the convenience tools. No I/O —
 * everything here is unit-testable offline.
 *
 * Format pitfalls handled here (see the spec/docs):
 * - CLS p75 is a string-encoded double ("0.05"); timings are integer ms.
 * - History timeseries mix numbers with "NaN" strings and nulls.
 * - Densities are rounded to 4 decimals and sum to ~1.0, not exactly 1.0.
 */
import type { CruxCollectionPeriod, CruxDate, CruxMetric } from "./types.js";

/** Metrics with a histogram and/or percentiles.p75. */
export const PERCENTILE_METRICS = [
  "largest_contentful_paint",
  "interaction_to_next_paint",
  "cumulative_layout_shift",
  "first_contentful_paint",
  "experimental_time_to_first_byte",
  "round_trip_time",
  "largest_contentful_paint_image_time_to_first_byte",
  "largest_contentful_paint_image_resource_load_delay",
  "largest_contentful_paint_image_resource_load_duration",
  "largest_contentful_paint_image_element_render_delay",
] as const;

/**
 * Fraction-only (enum) metrics. Note: `form_factors` is returned only when the
 * request does NOT set a formFactor filter.
 */
export const FRACTION_METRICS = [
  "form_factors",
  "navigation_types",
  "largest_contentful_paint_resource_type",
] as const;

/**
 * Every currently documented metric. first_input_delay (FID) was removed from
 * the API — the stale discovery document still lists it, do not expose it.
 */
export const ALL_METRICS = [...PERCENTILE_METRICS, ...FRACTION_METRICS] as const;
export type MetricName = (typeof ALL_METRICS)[number];

/** The three Core Web Vitals. */
export const CWV_METRICS = [
  "largest_contentful_paint",
  "interaction_to_next_paint",
  "cumulative_layout_shift",
] as const;

/** CWV plus the diagnostic timings get_core_web_vitals reports. */
export const ASSESSMENT_METRICS = [
  ...CWV_METRICS,
  "first_contentful_paint",
  "experimental_time_to_first_byte",
] as const;

export type Rating = "good" | "needs-improvement" | "poor";

/**
 * p75 thresholds (good ≤ good; poor > poor; needs-improvement in between),
 * per web.dev. Metrics without an official threshold (RTT, LCP subparts) get
 * no rating.
 */
const THRESHOLDS: Partial<Record<string, { good: number; poor: number }>> = {
  largest_contentful_paint: { good: 2500, poor: 4000 },
  interaction_to_next_paint: { good: 200, poor: 500 },
  cumulative_layout_shift: { good: 0.1, poor: 0.25 },
  first_contentful_paint: { good: 1800, poor: 3000 },
  experimental_time_to_first_byte: { good: 800, poor: 1800 },
};

/**
 * Tolerant numeric parse for CrUX values: accepts numbers and numeric strings
 * (CLS "0.05"), returns null for null/undefined/"NaN"/junk.
 */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Rates a p75 value against the metric's thresholds; null when unrateable. */
export function rate(metric: string, p75: number | null): Rating | null {
  const t = THRESHOLDS[metric];
  if (!t || p75 === null) return null;
  if (p75 <= t.good) return "good";
  if (p75 <= t.poor) return "needs-improvement";
  return "poor";
}

/** {year, month, day} → "YYYY-MM-DD" (null when absent). */
export function dateOf(d: CruxDate | undefined): string | null {
  if (!d || typeof d.year !== "number") return null;
  const mm = String(d.month ?? 0).padStart(2, "0");
  const dd = String(d.day ?? 0).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

/** Collection period → {first_date, last_date} strings (null when absent). */
export function periodOf(
  p: CruxCollectionPeriod | undefined,
): { first_date: string | null; last_date: string | null } | null {
  if (!p) return null;
  return { first_date: dateOf(p.firstDate), last_date: dateOf(p.lastDate) };
}

export interface MetricSummary {
  p75: number | null;
  rating: Rating | null;
  /** Densities of the 3 standard bins; sums to ~1.0 (rounded to 4 decimals). */
  densities?: { good: number; needs_improvement: number; poor: number };
}

/**
 * Summarizes the percentile metrics of a record: p75 (CLS string decoded),
 * rating and good/ni/poor densities. Fraction-only metrics (form_factors, …)
 * are skipped — they carry no p75.
 */
export function summarizeMetrics(
  metrics: Record<string, CruxMetric> | undefined,
): Record<string, MetricSummary> {
  const out: Record<string, MetricSummary> = {};
  for (const [name, m] of Object.entries(metrics ?? {})) {
    if (!m || (m.percentiles === undefined && m.histogram === undefined)) continue;
    const p75 = num(m.percentiles?.p75);
    const summary: MetricSummary = { p75, rating: rate(name, p75) };
    if (Array.isArray(m.histogram) && m.histogram.length === 3) {
      summary.densities = {
        good: num(m.histogram[0]?.density) ?? 0,
        needs_improvement: num(m.histogram[1]?.density) ?? 0,
        poor: num(m.histogram[2]?.density) ?? 0,
      };
    }
    out[name] = summary;
  }
  return out;
}

/**
 * true when every present Core Web Vital (LCP, INP, CLS) rates "good", false
 * when any does not, null when none of the three is in the record.
 */
export function passesCoreWebVitals(summaries: Record<string, MetricSummary>): boolean | null {
  const ratings = CWV_METRICS.map((m) => summaries[m]?.rating).filter((r) => r != null);
  if (ratings.length === 0) return null;
  return ratings.every((r) => r === "good");
}

export interface TrendPoint {
  /** Last day of the 28-day collection window ("YYYY-MM-DD"). */
  period_end: string | null;
  p75: number;
  rating: Rating | null;
}

export interface TrendDelta {
  first_p75: number;
  last_p75: number;
  /** last - first; negative = improved (lower is better for every metric here). */
  change: number;
  direction: "improved" | "regressed" | "stable";
}

/**
 * Extracts a p75 timeseries for one metric. Ineligible periods (null / "NaN")
 * are skipped; the delta compares the first and last surviving points.
 */
export function metricTrend(
  metric: string,
  series: CruxMetric,
  periods: CruxCollectionPeriod[],
): { points: TrendPoint[]; delta: TrendDelta | null } {
  const p75s = series.percentilesTimeseries?.p75s ?? [];
  const points: TrendPoint[] = [];
  p75s.forEach((v, i) => {
    const n = num(v);
    if (n === null) return;
    points.push({ period_end: dateOf(periods[i]?.lastDate), p75: n, rating: rate(metric, n) });
  });

  let delta: TrendDelta | null = null;
  if (points.length >= 2) {
    const first = points[0].p75;
    const last = points[points.length - 1].p75;
    const change = Math.round((last - first) * 10_000) / 10_000;
    delta = {
      first_p75: first,
      last_p75: last,
      change,
      direction: change < 0 ? "improved" : change > 0 ? "regressed" : "stable",
    };
  }
  return { points, delta };
}
