# Chrome Web Store Listing — Steam Revenue Estimate

> Last Updated: 2026-10-07. Draft; extension has not been submitted or published.

## Store Listing

**Extension Name**: Steam Revenue Estimate

**Short Description**: See approximate gross and net revenue on Steam game pages, with transparent assumptions and adjustable estimates.

**Detailed Description**

See approximate lifetime gross and net revenue directly below developer and publisher information on Steam game pages.

Open the details to see estimated sales, the price and review count behind the calculation, and a compact stacked bar of financial deductions. Open the gear icon to change assumptions about discounts, regional prices, refunds, taxes and the Steam fee, then save your preferred values for all games. English and Russian interfaces are included.

Open a paid game's Steam page to see the estimate. All estimates use USD. Free-to-play games, demos, unreleased games and DLC are excluded. If reliable input data is unavailable, the extension explains why it cannot calculate a result.

Values are approximate, not audited revenue or developer profit. Scenario ranges illustrate the effect of different sales-per-review assumptions and are not guaranteed error bounds.

Settings and cached public game facts stay on your device. The extension contacts Steam for the currently opened game's public information and contains no advertising or analytics.

Support contact: pending before submission.

**Category**: Productivity

**Single Purpose**: Show transparent approximate revenue estimates on Steam game store pages.

**Primary Language**: English; Russian UI also available.

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|---|---|---|---|
| Store icon | 128×128 PNG | Not created; required before submission | — |
| Screenshot 1 | 1280×800 or 640×400 | Store asset not created | — |
| Screenshot 2 | 1280×800 or 640×400 | Store asset not created | — |
| Small promo tile | 440×280 | Optional; not created | — |
| Marquee tile | 1400×560 | Optional; not created | — |

### Screenshot Notes

Capture the collapsed block below publisher and expanded details/settings on a real Steam page. Local QA screenshots are in .cache/live-smoke and are not approved store assets. The manifest does not reference missing icons.

## Permissions Justification

| Permission | Type | Justification |
|---|---|---|
| storage | permissions | Save the user's estimation assumptions and cache public game price/review totals to reduce repeated requests and support fallback during Steam failures. |
| https://store.steampowered.com/* | host_permissions | Obtain the currently opened game's public USD price and lifetime review total from Steam and display the revenue estimate on its store page. |

The static content script runs only on HTTPS Steam app pages in the top frame. No tabs, activeTab, scripting or all-URLs permissions are requested. There is no remote executable code.

## Privacy & Data Use

### Data Collection

The extension processes and stores public website content and estimation settings locally. AppID requests to Steam reveal the inspected game to Steam. It does not send a browsing history dataset to the publisher.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|---|---|---|---|---|
| Personally identifiable info | No | No by the extension; Steam sees standard network information | — | — |
| Health info | No | No | — | — |
| Financial/payment info | No | No | — | — |
| Authentication info | No | No; requests omit credentials | — | — |
| Personal communications | No | No | — | — |
| Location | No explicit collection | IP visible to Steam for normal requests | Fetch public facts | Steam |
| Web history | Limited inspected Steam AppIDs in local cache | Current AppID sent to Steam; cache not uploaded | Estimate current game and reuse facts | Current request to Steam only |
| User activity | Estimation parameters locally | No | Persist chosen assumptions | No |
| Website content | Public type/status/price/review totals | AppID/filter requests only; received facts cached locally | Calculate estimates | No cache sharing |

### Data Use Certification

- [x] Data is NOT sold to third parties.
- [x] Data is NOT used for purposes unrelated to the extension's core functionality.
- [x] Data is NOT used for creditworthiness or lending purposes.

## Privacy Policy

**Privacy Policy URL**: Pending; publish docs/privacy.md at a public URL and supply a real contact before submission.

## Distribution

**Visibility**: Not submitted; planned public distribution.

**Regions**: Planned all regions where Chrome and Steam are available; estimates always use USD.

## Developer Info

**Publisher Name**: Pending user-supplied publisher identity.

**Contact Email**: Pending user-supplied public contact.

**Support URL / Email**: Pending.

**Homepage URL**: Pending; optional.

## Version History

| Version | Date | Changes | Status |
|---|---|---|---|
| 1.0.1 | 2026-10-07 | Compact min–max ranges alongside full Gross/Net amounts. | GitHub release; Web Store not submitted |
| 1.0.0 | 2026-10-07 | First GitHub release: full dollar amounts, readable headings/ranges, concise installation guide and release ZIP. | GitHub release; Web Store not submitted |
| 0.2.1 | 2026-10-07 | Keep the estimate at the bottom of upper game metadata, below publisher and any later-added rows, before tags. | Draft |
| 0.2.0 | 2026-10-07 | Concise Details, gear settings, deduction bar, spacing; default formula matches Steam Revenue Calculator; migration from v1. | Draft |
| 0.1.0 | 2026-10-07 | Inline lifetime gross/net estimate, scenarios, details and editable assumptions; local cache; English/Russian UI. | Draft |

## Review Notes

### Known Issues / Limitations

Boxleiter estimates cannot recover true transaction data. Corrections are explicit assumptions, and present-day ordinary price is a historical-price proxy. Store endpoints and DOM may change. Page fallback refuses unproven currency or review coverage. Store listing assets, public privacy URL, publisher identity and contact remain publication requirements; they do not block unpacked use.

### Rejection History

None; no submission has been made.
