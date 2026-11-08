# AdTech Playground: RTB Auction Simulator

> Explore the mechanics of programmatic advertising through interactive experiments.

An interactive, browser-based simulator of a **simplified first-price Real-Time Bidding (RTB) auction**, written for developers who are new to ad tech.

> **Simulated data only.** This project does not connect to real advertising infrastructure. No bid requests are transmitted, and no exchange, SSP or DSP is contacted. It is an independent educational project and is not affiliated with any advertising exchange or ad-tech provider. It is not a production advertising auction.

---

## Why this project exists

Programmatic advertising documentation assumes a lot of context: OpenRTB objects, auction types, CPM pricing, DSPs and SSPs. This project makes those ideas concrete. You configure advertisers and bids, run an auction and see how a winner is chosen, why bids get rejected, how ties are resolved and what a bid request looks like. A small, readable, tested codebase sits behind it.

## What is Real-Time Bidding?

Real-Time Bidding is a form of programmatic advertising in which **each individual ad impression is auctioned while the page or app is loading**:

1. A user opens a page that contains an ad slot, creating an impression opportunity.
2. A supply-side platform (SSP) or ad exchange builds a **bid request** describing that impression.
3. Demand-side platforms (DSPs) acting for advertisers evaluate the request and return **bid responses** with a price.
4. The exchange validates and ranks the bids.
5. The winner's ad is shown. In a **first-price** auction, it pays its own bid.

This is a simplified picture. Real supply chains can involve header bidding, several SSPs and exchanges, private marketplaces and direct deals.

## Features

**Implemented**

- Three default advertisers: Alpha $2.50, Beta $3.20 and Gamma $2.80 CPM.
- Add advertisers (up to 12), edit names, change bids, remove advertisers, run the auction and reset to the defaults.
- Pressing **Enter** in any field runs the auction, with CJK IME composition handled correctly.
- Validation with stable error codes and specific messages, shown inline and in the results.
- Results panel showing:
  - the winning advertiser and winning CPM bid
  - the estimated cost of one impression (CPM ÷ 1,000)
  - an explanation of the first-price rule using that auction's numbers
  - counts of bids received, valid and rejected, plus the clearing price
  - an explanation of the tie-break decision
  - ranked competing bids and rejected bids with reasons
  - a **no-fill** result when no bid is valid
- Bid states are distinguished by text, symbol, border style and colour together: **Won**, **Lost**, **Tied · lost** and **Rejected**.
- Five-stage auction timeline with a technical explanation of each stage and **illustrative** timestamps, clearly labelled as not measured.
- Illustrative **OpenRTB 2.6-inspired** bid request with per-field annotations, a generation timestamp and a **Copy JSON** button. If clipboard access is blocked, the button selects the JSON instead.
- Educational sections: *Under the hood*, *Learn the fundamentals*, *How this project works* and *Future development*.
- Accessibility features:
  - labelled inputs and accessible button names
  - visible focus styles and a skip link
  - ARIA live regions for status updates
  - `aria-invalid` and `aria-describedby` on invalid fields
  - support for `prefers-reduced-motion`
- Responsive layout with no horizontal page overflow down to 360px. Advertiser rows restack as cards on mobile.
- 30 automated tests, run with Node's built-in test runner.

## Technologies

- Vanilla **HTML**, **CSS** and **JavaScript (ES2020)**, with no framework and no build step.
- **Node.js ≥ 18** built-in test runner (`node:test`, `node:assert`) for automated tests. There are **no npm dependencies**.
- Geist and Geist Mono fonts from Google Fonts, with system fallbacks if they fail to load.

## Project structure

```
.
├── index.html            # Structure and educational content
├── styles.css            # Presentation, responsive layout, reduced-motion rules
├── auction-core.js       # Pure auction logic (no DOM): validation, cents, ranking, tie-break, pricing, no-fill, bid request
├── app.js                # UI layer: state, rendering, timeline animation, events, clipboard
├── tests/
│   ├── auction-core.test.js   # Auction logic tests
│   └── docs-snippets.test.js  # Checks that every "Under the hood" snippet exists verbatim in the source
├── package.json          # npm scripts only, no dependencies
└── README.md
```

### Architecture

```
┌──────────────────────────── Browser ────────────────────────────┐
│  index.html ── styles.css                                       │
│      │ loads                                                    │
│      ▼                                                          │
│  app.js  ──calls──▶  auction-core.js  (window.AuctionCore)      │
│  (state, DOM,        (validation, integer cents, ranking,       │
│   timeline, events)   tie-break, first-price, no-fill, JSON)    │
└─────────────────────────────────────────────────────────────────┘
   tests/*.test.js ──require()──▶ auction-core.js   (Node, no browser)

   No backend · no database · no external API · no DSP connection
```

`auction-core.js` uses a small UMD-style wrapper. In the browser it is a classic script that defines `window.AuctionCore`. In Node, `require()` returns the same API through `module.exports`. Classic scripts were kept on purpose so the page still works when opened directly from the file system, where ES module imports would be blocked by `file://` CORS rules.

All auction calculations happen locally in the browser.

## How the auction algorithm works

The logic lives in `runAuctionLogic(entries)` in `auction-core.js`.

1. **Validate.** Each `{ id, name, bid }` entry is checked by `validateAdvertiser`, and its original position (`index`) is recorded.
   - **Name:** trimmed, 1–40 characters (`NAME_EMPTY`, `NAME_TOO_LONG`).
   - **Bid:** trimmed, and must match `/^\d+(\.\d{1,2})?$/`. The specific failure codes are `BID_EMPTY`, `BID_NEGATIVE`, `BID_TOO_MANY_DECIMALS` and `BID_NOT_A_NUMBER`, the last covering symbols, commas, spaces and exponents.
   - **Range:** after conversion to cents, a bid must be at least 1 cent (`BID_ZERO`) and at most 100,000 cents, i.e. $1000.00 CPM (`BID_ABOVE_MAX`).
2. **Convert to integer cents.** `toCents("3.2")` returns `320`. The string is split on `.` and the fraction padded to two digits, with no `parseFloat`, so every comparison uses exact integers. This avoids floating-point surprises such as `parseFloat("0.29") * 100 === 28.999999999999996`.
3. **Rank.** Valid bids are sorted with `b.cents - a.cents || a.index - b.index`, which means highest first and, when amounts are equal, earliest submission first.
4. **Tie-break.** Because of that sort, the earliest of several equal top bids becomes `validBids[0]`. All bids equal to the winning amount are returned as `tiedBids` so the UI can explain the decision.
5. **Price.** First-price: `clearingPriceCents = winner.cents`. The runner-up does not affect the price.
6. **No-fill.** With no valid bids, `status` is `"no-fill"` and `noFillReason` is `"NO_BIDDERS"` for an empty list or `"ALL_BIDS_REJECTED"` when every bid failed validation.

The return shape is:

```js
{
  status: "filled" | "no-fill",
  noFillReason: null | "NO_BIDDERS" | "ALL_BIDS_REJECTED",
  winner, runnerUp,            // evaluated bid objects or null
  clearingPriceCents,          // integer or null
  validBids, rejectedBids,     // arrays; rejected entries carry errors: [{ field, code, message }]
  tiedBids,                    // [] unless 2+ bids share the winning amount
  totalBids
}
```

## Auction assumptions

- There is a single impression, a 300×250 banner.
- Each advertiser submits exactly one bid in USD CPM, and every advertiser is treated as having responded within `tmax`.
- The auction is pure first-price, with no fees, deal priorities or bid shading.
- Ties go to the earliest advertiser in submission order. Real exchanges define their own rules, and some choose at random.
- The bid floor is fixed at $0.01 CPM, which is the same as the minimum valid bid. It is not configurable.
- Timeline timestamps are **illustrative**: they are random values drawn from fixed ranges, not measurements. The on-screen animation runs about 550ms per stage, or 0ms under reduced motion, purely so each stage is readable.

## The OpenRTB-inspired bid request

Every run generates an **illustrative** request such as:

```json
{
  "id": "req-k3x9a1bq",
  "test": 1,
  "at": 1,
  "tmax": 120,
  "cur": ["USD"],
  "imp": [{
    "id": "1",
    "banner": { "format": [{ "w": 300, "h": 250 }] },
    "bidfloor": 0.01,
    "bidfloorcur": "USD",
    "secure": 1
  }],
  "site": {
    "id": "site-example-news",
    "domain": "example-news.test",
    "page": "https://example-news.test/technology/article",
    "publisher": { "id": "pub-example" }
  },
  "device": { "devicetype": 1, "geo": { "country": "USA" } }
}
```

Field names and enumerations follow [OpenRTB 2.6](https://github.com/InteractiveAdvertisingBureau/openrtb2.x):

| Field | Meaning |
| --- | --- |
| `id` | Unique bid request ID. Bidders echo it in their response. |
| `test` | `1` = test mode, so the auction is not billable. |
| `at` | Auction type: `1` = first price, `2` = second price plus. |
| `tmax` | Maximum time, in ms, to wait for bids, including network latency. |
| `cur` | Accepted bid currencies (ISO-4217). |
| `imp[].banner.format` | Allowed banner sizes. The `format` array is used instead of top-level `w`/`h`. |
| `imp[].bidfloor` / `bidfloorcur` | Minimum CPM and its currency. |
| `imp[].secure` | `1` requires HTTPS-safe creative. |
| `site` | Domain, full page URL and publisher. |
| `device.devicetype` | **Numeric** AdCOM Device Type: `1` = Mobile/Tablet (`4` = Phone, `5` = Tablet). |
| `device.geo.country` | ISO 3166-1 **alpha-3** country code, e.g. `USA`. |

Changes from the previous version:

- `device.devicetype` was the string `"mobile"`. It is now the numeric enumeration `1`.
- `site.page` is now a full URL, as the spec describes.
- `banner` now uses the `format` array.
- `test`, `cur`, `secure` and `site.publisher` were added.
- The non-standard `user: { id: "anonymous" }` was removed.

This is **not** a complete or certified OpenRTB request. Production requests usually also carry fields such as `device.ua`, `device.ip` or `geo` data, `regs` and `user` consent signals, and `source.schain`. A real exchange typically sends a request like this to many DSPs in parallel. This simulator only displays the JSON and never transmits it.

## Running locally

No install step is needed.

**Option A: open the file.** Double-click `index.html`, or open it with your browser's *File → Open*.

**Option B: serve it locally**, which is recommended so the Clipboard API is available:

```bash
npx --yes serve .
# or
python3 -m http.server 8080
```

Then visit the printed URL, for example `http://localhost:3000` or `http://localhost:8080`.

## Running the tests

Requires Node.js 18 or newer. There are no dependencies to install.

```bash
npm test
# equivalent to:
node --test
```

The suite contains **30 tests**:

- **Auction logic:**
  - correct winner from three different bids
  - first-price pricing
  - two equal top bids resolved by submission order, not alphabetical order
  - empty name rejected
  - zero, negative, above-maximum and more-than-two-decimal bids rejected
  - empty and non-numeric bids rejected
  - minimum bid of $0.01
  - no-fill when all bids are rejected
  - highest **valid** bid wins in a mixed list
  - empty advertiser list handled (`NO_BIDDERS`)
  - non-array input
- **Integer cents:** exact conversion, including `"0.29"`, and one-cent ordering.
- **Bid request:** valid JSON round-trip, numeric `devicetype`, alpha-3 country, impression with banner, floor and currency.
- **Documentation:** every code snippet in the *Under the hood* section exists verbatim in `auction-core.js`.

## Known limitations

- The auction is first-price only. There is no second-price mode, no fees and no deal or priority tiers.
- There is a single impression, and the bid floor is fixed.
- Bidders are hand-entered values, not DSPs. Bid responses are not modelled as OpenRTB `BidResponse` objects.
- Timeline timestamps are illustrative. No latency is measured, and no timeout or late-bid behaviour is simulated.
- The bid request is illustrative and is not schema-validated against the full OpenRTB specification.
- State is in memory only. Refreshing the page restores the defaults.
- In some sandboxed iframes, clipboard access is blocked. The **Copy JSON** button then selects the JSON and asks you to press Ctrl+C or Cmd+C.

## Potential future improvements

These are **proposed and not implemented**:

- A REST API exposing the auction core, for example `POST /auction`.
- Bid request and bid response validation against a JSON Schema derived from OpenRTB.
- Configurable bid floors per impression.
- Multiple auction models, including second-price, and a side-by-side comparison.
- Auction analytics across repeated runs, such as win rate and average clearing price.
- More demonstrations, such as bid shading, `tmax` timeouts with late bids, and multi-impression requests.

## Licence

MIT. Educational use encouraged.
