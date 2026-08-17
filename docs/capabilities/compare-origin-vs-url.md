# Chrome UX Report: Origin vs specific page — MCP tool

**Chrome UX Report MCP tool:** Compares the site-wide origin record against one specific page (2 API requests): p75 + rating per metric for each, so you can tell whether a page is faster or slower than the site average.

Technical name: `compare_origin_vs_url`

## What task it solves

> I want to origin vs specific page.

Compares the site-wide origin record against one specific page (2 API requests): p75 + rating per metric for each, so you can tell whether a page is faster or slower than the site average.

## When to use it

Use this capability when you need “Origin vs specific page” without doing the same work manually in the Chrome UX Report interface. It runs only when an AI client calls it.

## What to provide

- `origin` — **required**. Site origin — scheme + host only, e.g. https://example.com. Required.
- `url` — **required**. The page URL to compare against the origin, e.g. https://example.com/pricing/. Required.
- `form_factor` — **optional**. Device class filter. Omit for the aggregated record across all devices. tablet traffic is tiny and usually has no data.
- `metrics` — **optional**. Metric names to return; omit for all available metrics. Timings are integer milliseconds; cumulative_layout_shift is a string-encoded double. form_factors is only returned when form_factor is NOT set.

## What it returns

Returns compact JSON from the upstream API or a clear MCP tool error. The exact fields depend on the operation and are documented in the technical reference.

## What changes in Chrome UX Report

The tool reads Chrome UX Report data and does not change it.

## Example request

> Origin vs specific page in Chrome UX Report. Ask for any required identifiers that are missing.

## Errors and limitations

Either side can come back {no_data: true} (single pages often lack data; redirecting homepages can lack origin data while pages have it). Default metrics: the three Core Web Vitals. Both `origin` AND `url` are required here (unlike the other tools).

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Phone vs desktop vs tablet](./compare-form-factors.md) — `compare_form_factors`
- [Core Web Vitals assessment](./get-core-web-vitals.md) — `get_core_web_vitals`
- [Core Web Vitals trend](./get-cwv-trend.md) — `get_cwv_trend`

## Technical details

- **Impact:** read-only
- **Group:** Core Web Vitals
- **Description source:** `compare_origin_vs_url` registration in `src/tools/vitals.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
