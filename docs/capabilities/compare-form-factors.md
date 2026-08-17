# Chrome UX Report: Phone vs desktop vs tablet — MCP tool

**Chrome UX Report MCP tool:** Compares real-user performance across device classes for an origin or URL: one aggregated all-devices record plus phone, desktop and tablet records (4 API requests = 4 quota units of the 150/min budget).

Technical name: `compare_form_factors`

## What task it solves

> I want to phone vs desktop vs tablet.

Compares real-user performance across device classes for an origin or URL: one aggregated all-devices record plus phone, desktop and tablet records (4 API requests = 4 quota units of the 150/min budget).

## When to use it

Use this capability when you need “Phone vs desktop vs tablet” without doing the same work manually in the Chrome UX Report interface. It runs only when an AI client calls it.

## What to provide

- `origin` — **optional**. Site origin — scheme + host only, e.g. https://example.com (no path, no trailing slash). Aggregates real-user data across ALL pages of the site. Mutually exclusive with `url`. http/https and www/non-www are distinct keys; use the canonical variant.
- `url` — **optional**. A specific page URL, e.g. https://example.com/pricing/. Mutually exclusive with `origin`. Pass the final post-redirect URL (the API does not follow redirects); fragments and query params are stripped by the dataset. Single pages have fewer samples and often have no data — fall back to `origin` on a no_data result.
- `metrics` — **optional**. Metric names to return; omit for all available metrics. Timings are integer milliseconds; cumulative_layout_shift is a string-encoded double. form_factors is only returned when form_factor is NOT set.

## What it returns

Returns compact JSON from the upstream API or a clear MCP tool error. The exact fields depend on the operation and are documented in the technical reference.

## What changes in Chrome UX Report

The tool reads Chrome UX Report data and does not change it.

## Example request

> Phone vs desktop vs tablet in Chrome UX Report. Ask for any required identifiers that are missing.

## Errors and limitations

Per device: p75 + rating per metric; `traffic_share` gives each device's fraction of page loads (from the unfiltered form_factors metric). Devices without enough data come back as {no_data: true} — expected for tablet almost always. Default metrics: the three Core Web Vitals. Provide exactly one of `origin` or `url`.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Origin vs specific page](./compare-origin-vs-url.md) — `compare_origin_vs_url`
- [Core Web Vitals assessment](./get-core-web-vitals.md) — `get_core_web_vitals`
- [Core Web Vitals trend](./get-cwv-trend.md) — `get_cwv_trend`

## Technical details

- **Impact:** read-only
- **Group:** Core Web Vitals
- **Description source:** `compare_form_factors` registration in `src/tools/vitals.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
