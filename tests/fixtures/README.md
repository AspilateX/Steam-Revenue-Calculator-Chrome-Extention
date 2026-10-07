# Steam fixtures

Public data captured on October 7, 2026 from AppID 413150 (Stardew Valley), market US, languages English/Russian.

- `appdetails-live.json`: retained only type, price, release and genre data required by the adapter.
- `appreviews-live.json`: query summary only; individual review objects and reviewer identities are excluded.
- `steam-english.html`, `steam-russian.html`: compact copies of offers, upper developer/publisher rows, lower duplicate metadata, purchase section and selected public review props. Scripts, forms, session IDs and hidden inputs are removed.

`scripts/compact-fixtures.mjs` produces these from local raw pages under ignored `.cache/steam` and the downloaded responses. It does not download anything or execute Steam scripts. Re-capturing changes the fixed live data; update the adapter tests when intentionally changing fixtures. Synthetic edge cases derive from these fixtures in tests, including extra editions/bundles, unknown currency, missing anchors and unfiltered review props.

The fixtures reflect a 30% current discount and a language-specific upper review count. Production must use the ordinary price and must not treat that visible review count as global.
