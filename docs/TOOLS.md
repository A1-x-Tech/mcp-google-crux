# Tools

For task-oriented guidance, open the [MCP capability catalog](./capabilities/index.md). This page remains the technical reference for schemas and API responses.

All tools are read-only — the Chrome UX Report API has no write endpoints. Inputs
are normalized (`phone|desktop|tablet`, snake_case fields); the client maps them to
the API's wire values (`PHONE|DESKTOP|TABLET`, camelCase body fields) and injects
the API key as the `key=` query parameter.

Every tool accepts **exactly one** of `origin` (whole site: scheme + host, e.g.
`https://example.com`) or `url` (a single page) — except `compare_origin_vs_url`,
which requires both. An HTTP 404 from the API means "no CrUX data" (insufficient
real-user traffic) and is returned as a structured `{no_data: true}` result, not
an error.

## Insights

| Tool | Description |
|---|---|
| `get_core_web_vitals` | One-call CWV assessment over the latest 28-day window: per metric (LCP, INP, CLS + diagnostic FCP, TTFB) the p75, a `good`/`needs-improvement`/`poor` rating (web.dev thresholds: LCP ≤2500ms/>4000ms, INP ≤200ms/>500ms, CLS ≤0.10/>0.25) and the good/ni/poor experience densities; plus an overall `passes_core_web_vitals` verdict. 1 API request. |
| `compare_form_factors` | Device breakdown: aggregated all-devices record plus phone, desktop and tablet, with `traffic_share` per device (from the unfiltered `form_factors` metric). Devices without data come back `{no_data: true}` — expected for tablet almost always. **4 API requests per call.** |
| `compare_origin_vs_url` | Site-wide origin record vs one specific page, p75 + rating per metric on both sides — tells whether a page is faster or slower than the site average. **2 API requests per call.** |
| `get_cwv_trend` | Weekly p75 trend from the History API: per metric an array of `{period_end, p75, rating}` (ineligible weeks skipped) and a `delta` (first vs last p75, `improved`/`regressed`/`stable`). `weeks` = 1..40, default 25. 1 API request. |

## Raw records

| Tool | Description |
|---|---|
| `query_record` | The latest 28-day rolling record verbatim: per metric a 3-bin `histogram` (good/ni/poor densities), `percentiles.p75` and `fractions` for enum metrics; `collectionPeriod`; `urlNormalizationDetails` when the API normalized the URL (e.g. stripped a fragment). Updated daily ~04:00 UTC. |
| `query_history_record` | The weekly timeseries verbatim: `histogramTimeseries`, `percentilesTimeseries.p75s`, `fractionTimeseries`, aligned with `collectionPeriods` (up to 40 weekly periods, each a 28-day window; `collection_period_count` caps the depth). Updated Mondays ~04:00 UTC. |

## Metrics

`largest_contentful_paint`, `interaction_to_next_paint`, `cumulative_layout_shift`,
`first_contentful_paint`, `experimental_time_to_first_byte`, `round_trip_time`
(histogram + p75); `form_factors`, `navigation_types`,
`largest_contentful_paint_resource_type` (fractions only); and the four
`largest_contentful_paint_image_*` subpart metrics (percentiles only).
`first_input_delay` (FID) was removed from the API.

Notes (format pitfalls the server already handles — relevant when reading raw output):

- **CLS is a string.** `cumulative_layout_shift` p75 is a string-encoded double
  (`"0.05"`); all timing metrics are integer milliseconds.
- **History emits `"NaN"` and `null`.** Ineligible periods appear as `null` p75s and
  `"NaN"` densities/fractions — the convenience tools skip them.
- **`form_factors` disappears** when the request sets a `form_factor` filter; the
  server requests it only on unfiltered queries.
- **Densities are rounded** to 4 decimals and sum to ~1.0, not exactly 1.0.
- **`collectionPeriod` always spans 28 days**, even when the underlying data covers
  less — don't infer sample coverage from it.
- **Keys are exact.** `http://` vs `https://`, `www.` vs bare domain and redirects are
  distinct keys; pass the final post-redirect URL, or a 404 (`no_data`) follows.

## Quota

150 queries per minute per Google Cloud project, free, shared by both endpoints, no
paid upgrades and no batch API. The server retries 429s with backoff and, when the
quota is truly exhausted, returns an error explaining the limit. Data changes at most
daily — repeating a query within the same day returns identical data.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `CRUX_API_KEY` | yes | — | Google Cloud API key with the Chrome UX Report API enabled. Treat it as a secret. |
| `CRUX_API_BASE` | no | `https://chromeuxreport.googleapis.com` | API root host override. |
| `CRUX_TIMEOUT_MS` | no | `30000` | Per-request timeout, ms. |
| `CRUX_MAX_RETRIES` | no | `3` | Retries on transient errors (429, 5xx, network). |
