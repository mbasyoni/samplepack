# SamplePack

Version 0.1.0. A standalone, open-source research metadata utility.

SamplePack is a small browser-local workspace for reviewing a sample manifest before sharing a research dataset. It checks generic metadata and produces a documented handoff, while keeping the original input available.

## Run locally

Requirements: Python 3 (for a local static server), a modern browser with JavaScript modules, and optionally Node 24+ for the test suite. No packages need to be installed.

From this directory:

```sh
python -m http.server 8768 --bind 127.0.0.1
```

Open `http://127.0.0.1:8768/`. Use a local server rather than opening `index.html` directly: browser restrictions can block modules on `file:` URLs. Stop the server with Ctrl-C.

The application has no remote API, analytics, external scripts, fonts, or uploaded-file endpoint. Its CSP blocks network connections. A local static server serves application assets; input CSV content remains in browser memory. This is not encrypted storage. Close or clear the page to discard the current workspace.

## Workflow

1. Choose a UTF-8, comma-delimited CSV or a synthetic example.
2. Explicitly map a source column to `sample_id`, and optionally `batch`, `date`, and `notes`. Only exact target header matches are preselected; review is always required.
3. Select which optional fields are required. `sample_id` is always required.
4. Optionally choose ID whitespace trimming. It is off by default, and every changed ID is logged.
5. Confirm the mapping and run the review.
6. Resolve errors in a copy of the original file and reload. You can download the JSON issue report and original source even when errors block normalized CSV export.
7. Review warnings and documented transformations, then download the normalized CSV, JSON report, and original file separately.

The built-in examples are entirely synthetic. To use them, map `Specimen` to `sample_id`, `Batch` to `batch`, `Recorded` to `date`, and `Comment` to `notes`.

## Exact behavior

- Accepts strict CSV quoting, escaped quotes, CRLF/LF record separators, quoted multiline fields, Unicode, and an optional UTF-8 BOM.
- Rejects missing/duplicate headers, inconsistent field counts, malformed quotes, NUL bytes, invalid UTF-8, and exceeded limits.
- Limits: 1,000,000 source bytes, 10,000 data records, 100 columns, 100,000 characters in a cell.
- Record numbers count the header as record 1; multiline quoted cells do not add records.
- IDs are case-sensitive. `A` and `a` are distinct. Whitespace is preserved unless trimming was selected. Duplicate comparison uses the selected resulting ID value.
- Required fields use whitespace-aware emptiness checks. Values otherwise remain unchanged.
- Dates receive a YYYY-MM-DD format warning only. Calendar validity, time zones, and locale interpretation are deliberately outside scope.
- Unmapped columns are listed explicitly. They are excluded from the normalized four-column CSV but preserved in the downloadable original file.
- Original source bytes are retained. A SHA-256 is recorded when Web Crypto is available; otherwise the report says `null`, not an invented hash.
- Spreadsheet-formula-like cells are prefixed with an apostrophe in CSV export. The report documents exact before/after values and keeps raw mapped values. This changes exported text and mitigates, but does not universally eliminate, spreadsheet risks. Review data before opening it in any spreadsheet; spreadsheet-specific execution was not tested.
- The interface displays up to 500 issues; the JSON report includes all findings.
- No source data, manifest, or consent is silently retained after a clear/reset or replacement load. Changing mapping/options invalidates earlier results and confirmation.

## Verification

```sh
npm test
npm run check
```

The Node built-in test runner is the only test dependency. The reproducible tests are included in `tests/`. DOM-state tests use a lightweight test double: they verify event/state behavior, not browser rendering, real downloads, or assistive-technology compatibility.

Executed automated results: **50 passed, 0 failed, 0 skipped** on Node v24.22.1; syntax checks passed. An initial standalone localhost preview was unavailable. The documented managed Sites internal preview subsequently worked: clean/invalid review, local file selection, state invalidation, reset, keyboard control activation, and all three actual downloads passed. Original download bytes and source SHA-256 were verified; normalized CSV bytes matched the expected export.

Additional acceptance work includes full keyboard-only navigation, narrow-screen inspection, and additional browser/OS checks. No Windows/macOS/mobile or screen-reader certification is claimed.

## Provenance and IP boundary

All application source, styles, documentation, and fixtures were authored from scratch for this separate candidate on October 29, 2026 with AI assistance. No private product source, university/employer/customer dataset, commercial asset, scientific-analysis algorithm, or fitting model was imported into this implementation. UI icons use text/CSS; no third-party imagery or fonts are bundled. Runtime dependencies: browser standard APIs only. Development tools: Node and Python already installed in the environment.

Released under the MIT License. See `LICENSE`. This license applies only to the files in this standalone project. It grants no rights to any separate product, research code, dataset, or commercial asset. No competition acceptance, award, scientific certification, or cross-platform certification is claimed.

## Non-goals

No instrument integration, EIS/ECM/Lin-KK analysis, experimental outlier correction, ML training, cloud database, collaboration account, automatic measurement repair, physical interpretation, or scientific validation. A successful metadata review does not establish experimental validity.
