# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-08-09

### Added

- First functional release: MCP server (stdio) for the Chrome UX Report (CrUX)
  API with six read-only tools:
  - `get_core_web_vitals` — one-call CWV assessment: p75, good/needs-improvement/poor
    rating and experience densities for LCP, INP, CLS (+ FCP, TTFB), with an overall
    "passes Core Web Vitals" verdict;
  - `compare_form_factors` — phone vs desktop vs tablet vs all-devices breakdown
    with per-device traffic shares (4 API requests);
  - `compare_origin_vs_url` — site-wide origin record vs one specific page (2 requests);
  - `get_cwv_trend` — weekly p75 trend from the History API with a first-vs-last
    delta per metric (`improved` / `regressed` / `stable`);
  - `query_record` / `query_history_record` — raw pass-through access to both
    API endpoints (histograms, fractions, timeseries).
- Format handling for CrUX quirks: string-encoded CLS doubles, `"NaN"` strings and
  `null`s in History timeseries, 3-bin histograms, `{year, month, day}` dates.
- HTTP 404 ("chrome ux report data not found") is mapped to a structured
  `{no_data: true}` result — data absence is a normal answer, not a failure;
  `compare_form_factors` tolerates per-device gaps (tablet almost always lacks data).
- Resilience: retries with exponential backoff (honoring `Retry-After`) on 429/5xx
  and network errors, request timeout covering the response body, and a quota
  explanation (150 queries/min/project) on exhausted 429s.
- API-key hygiene: the key rides only in the `key=` query parameter, never appears
  in error messages, and tool errors scrub any `key=` value as defense in depth.
- Anonymous usage telemetry (ids/names/versions only — never the key, queried
  origins/URLs or tool arguments); opt out with `ASKADS_TELEMETRY=0`.
- Test suite (node:test, offline) covering the client, config, CWV math, every
  tool and the built `dist/` binary via a real MCP stdio handshake; CI on
  Node 20/22 and a daily live health check.

## [0.0.1] — 2026-08-09

### Added

- Package stub to reserve the npm name.

[Unreleased]: https://github.com/A1-x-Tech/mcp-google-crux/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/A1-x-Tech/mcp-google-crux/releases/tag/v0.1.0
[0.0.1]: https://github.com/A1-x-Tech/mcp-google-crux/commits/7eb0858
