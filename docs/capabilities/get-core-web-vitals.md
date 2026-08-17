# Chrome UX Report: Core Web Vitals assessment — MCP tool

**Chrome UX Report MCP tool:** One-call Core Web Vitals assessment for an origin or URL over the latest 28-day window.

Technical name: `get_core_web_vitals`

## What task it solves

> I want to core Web Vitals assessment.

One-call Core Web Vitals assessment for an origin or URL over the latest 28-day window.

## When to use it

Use this capability when you need “Core Web Vitals assessment” without doing the same work manually in the Chrome UX Report interface. It runs only when an AI client calls it.

## What to provide

- `origin` — **optional**. Site origin — scheme + host only, e.g. https://example.com (no path, no trailing slash). Aggregates real-user data across ALL pages of the site. Mutually exclusive with `url`. http/https and www/non-www are distinct keys; use the canonical variant.
- `url` — **optional**. A specific page URL, e.g. https://example.com/pricing/. Mutually exclusive with `origin`. Pass the final post-redirect URL (the API does not follow redirects); fragments and query params are stripped by the dataset. Single pages have fewer samples and often have no data — fall back to `origin` on a no_data result.
- `form_factor` — **optional**. Device class filter. Omit for the aggregated record across all devices. tablet traffic is tiny and usually has no data.

## What it returns

Returns {no_data: true} when the origin/URL has insufficient traffic in CrUX.

## What changes in Chrome UX Report

The tool reads Chrome UX Report data and does not change it.

## Example request

> Core Web Vitals assessment in Chrome UX Report. Ask for any required identifiers that are missing.

## Errors and limitations

Per metric (LCP, INP, CLS + diagnostic FCP and TTFB): p75, rating (good | needs-improvement | poor, web.dev thresholds: LCP ≤2500ms/>4000ms, INP ≤200ms/>500ms, CLS ≤0.10/>0.25) and the good/needs_improvement/poor user-experience densities (~sum 1.0). `passes_core_web_vitals` is true when all three CWV rate good. Timings are ms; CLS is unitless. Provide exactly one of `origin` or `url`.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Phone vs desktop vs tablet](./compare-form-factors.md) — `compare_form_factors`
- [Origin vs specific page](./compare-origin-vs-url.md) — `compare_origin_vs_url`
- [Core Web Vitals trend](./get-cwv-trend.md) — `get_cwv_trend`

## Technical details

- **Impact:** read-only
- **Group:** Core Web Vitals
- **Description source:** `get_core_web_vitals` registration in `src/tools/vitals.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
