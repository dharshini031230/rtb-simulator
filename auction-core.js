/*
 * AdTech Playground: RTB Auction Simulator — auction core
 * --------------------------------------------------------
 * Pure, DOM-free auction logic for a simplified, educational FIRST-PRICE auction:
 *   - Every advertiser submits one bid, expressed as a CPM (USD per 1,000 impressions).
 *   - Invalid entries (empty name, non-numeric, zero/negative, too large, >2 decimals) are rejected
 *     with a machine-readable code and a human-readable message.
 *   - Valid bids are converted to integer cents and ranked highest first.
 *   - The highest valid bid wins and pays exactly what it bid (first-price).
 *   - Ties are broken by submission order: the advertiser listed first wins.
 *   - If no valid bids remain, the result is a "no-fill".
 *
 * This file has no DOM access, so it runs both in the browser (as a classic
 * script that exposes window.AuctionCore) and in Node via require() for tests.
 * Nothing here makes network requests.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.AuctionCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ---------- Configuration ----------

  const DEFAULT_ADVERTISERS = Object.freeze([
    Object.freeze({ name: "Advertiser Alpha", bid: "2.50" }),
    Object.freeze({ name: "Advertiser Beta", bid: "3.20" }),
    Object.freeze({ name: "Advertiser Gamma", bid: "2.80" }),
  ]);

  const MAX_BID_CPM = 1000; // Upper sanity limit for a bid, in dollars CPM.
  const MAX_BID_CENTS = MAX_BID_CPM * 100;
  const MAX_ADVERTISERS = 12;
  const MAX_NAME_LENGTH = 40;

  // A bid must be digits with an optional 1-2 digit decimal part: "3", "3.2", "3.20".
  const BID_PATTERN = /^\d+(\.\d{1,2})?$/;

  // ---------- Formatting (display only) ----------

  function formatUsd(cents) {
    return "$" + (cents / 100).toFixed(2);
  }

  // Cost of a single impression = CPM / 1000. Shown with 5 decimals because it is tiny.
  function formatPerImpression(cents) {
    return "$" + (cents / 100 / 1000).toFixed(5);
  }

  // ---------- Integer-cents conversion ----------

  /*
   * Converts an already-validated bid string into integer cents WITHOUT
   * floating-point arithmetic: "3.2" -> 320, "2.50" -> 250, "7" -> 700.
   * Comparing integers avoids float surprises such as 0.1 + 0.2 !== 0.3.
   */
  function toCents(bid) {
    const [whole, fraction = ""] = bid.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  }

  // ---------- Validation ----------

  function issue(code, message) {
    return { code: code, message: message };
  }

  // Returns null when the name is acceptable, otherwise { code, message }.
  function validateName(rawName) {
    const name = String(rawName ?? "").trim();
    if (name === "") {
      return issue("NAME_EMPTY", "Name is empty. Every bidder needs a name so the result can identify it.");
    }
    if (name.length > MAX_NAME_LENGTH) {
      return issue("NAME_TOO_LONG",
        "Name is " + name.length + " characters long. The limit is " + MAX_NAME_LENGTH + " characters.");
    }
    return null;
  }

  // Returns { cents } for a valid bid, otherwise { code, message }.
  function validateBid(rawBid) {
    const bid = String(rawBid ?? "").trim();

    if (bid === "") {
      return issue("BID_EMPTY", "Bid is empty. Enter a CPM in US dollars, for example 2.50.");
    }
    if (/^-\d*\.?\d+$/.test(bid)) {
      return issue("BID_NEGATIVE", 'Bid "' + bid + '" is negative. CPM bids must be greater than $0.00.');
    }
    if (/^\d+\.\d{3,}$/.test(bid)) {
      const places = bid.split(".")[1].length;
      return issue("BID_TOO_MANY_DECIMALS",
        'Bid "' + bid + '" has ' + places + " decimal places. Use at most 2, because bids are compared in whole cents.");
    }
    if (!BID_PATTERN.test(bid)) {
      return issue("BID_NOT_A_NUMBER",
        'Bid "' + bid + '" is not a plain decimal number. Use digits and an optional decimal point ' +
        "(for example 2.50), without currency symbols, commas, spaces or exponents.");
    }

    const cents = toCents(bid);
    if (cents <= 0) {
      return issue("BID_ZERO", 'Bid "' + bid + '" is zero. The minimum bid is $0.01 CPM.');
    }
    if (cents > MAX_BID_CENTS) {
      return issue("BID_ABOVE_MAX",
        'Bid "' + bid + '" exceeds the simulator maximum of ' + formatUsd(MAX_BID_CENTS) + " CPM.");
    }
    return { cents: cents };
  }

  /*
   * Validates one advertiser entry.
   * Returns { valid, cents, nameError, nameCode, bidError, bidCode }.
   */
  function validateAdvertiser(adv) {
    const nameIssue = validateName(adv.name);
    const bidCheck = validateBid(adv.bid);
    const bidIssue = "code" in bidCheck ? bidCheck : null;

    return {
      valid: !nameIssue && !bidIssue,
      cents: bidIssue ? null : bidCheck.cents,
      nameError: nameIssue ? nameIssue.message : "",
      nameCode: nameIssue ? nameIssue.code : null,
      bidError: bidIssue ? bidIssue.message : "",
      bidCode: bidIssue ? bidIssue.code : null,
    };
  }

  // ---------- Core auction logic ----------

  /*
   * Runs a first-price auction over a list of { id, name, bid } entries.
   *
   * 1. Validate every entry and keep its original submission order (index).
   * 2. Separate valid bids from rejected ones.
   * 3. Sort valid bids by amount (highest first). For equal amounts,
   *    the earlier submission ranks higher. This is the tie-break rule.
   * 4. The first valid bid is the winner. It pays its own bid (first-price).
   * 5. With no valid bids, the impression is not sold (no-fill).
   */
  function runAuctionLogic(entries) {
    const list = Array.isArray(entries) ? entries : [];

    const evaluated = list.map(function (adv, index) {
      const check = validateAdvertiser(adv);
      const errors = [];
      if (check.nameCode) errors.push({ field: "name", code: check.nameCode, message: check.nameError });
      if (check.bidCode) errors.push({ field: "bid", code: check.bidCode, message: check.bidError });

      return {
        id: adv.id,
        name: String(adv.name ?? "").trim() || "(unnamed advertiser #" + (index + 1) + ")",
        rawBid: String(adv.bid ?? "").trim(),
        index: index,
        valid: check.valid,
        cents: check.cents,
        errors: errors,
        reason: errors.map(function (e) { return e.message; }).join(" "),
      };
    });

    const validBids = evaluated
      .filter(function (b) { return b.valid; })
      .sort(function (a, b) { return b.cents - a.cents || a.index - b.index; });

    const rejectedBids = evaluated.filter(function (b) { return !b.valid; });

    const winner = validBids.length > 0 ? validBids[0] : null;
    const runnerUp = validBids.length > 1 ? validBids[1] : null;

    // A tie exists when more than one valid bid equals the winning amount.
    const tiedBids = winner
      ? validBids.filter(function (b) { return b.cents === winner.cents; })
      : [];

    let noFillReason = null;
    if (!winner) {
      noFillReason = evaluated.length === 0 ? "NO_BIDDERS" : "ALL_BIDS_REJECTED";
    }

    return {
      status: winner ? "filled" : "no-fill",
      noFillReason: noFillReason,
      winner: winner,
      clearingPriceCents: winner ? winner.cents : null, // first-price: winner pays own bid
      runnerUp: runnerUp,
      validBids: validBids,
      rejectedBids: rejectedBids,
      tiedBids: tiedBids.length > 1 ? tiedBids : [],
      totalBids: evaluated.length,
    };
  }

  // ---------- Bid request (illustrative, OpenRTB 2.6-inspired) ----------

  /*
   * Builds an ILLUSTRATIVE bid request using field names and enumerations from
   * OpenRTB 2.6. It is deliberately minimal and is not a complete production request.
   * It is displayed in the UI only. It is never transmitted.
   */
  function buildBidRequest(options) {
    const opts = options || {};
    const id = opts.id || "req-" + Math.random().toString(36).slice(2, 10);

    return {
      id: id,
      test: 1, // 1 = test mode: auctions are not billable.
      at: 1, // Auction type: 1 = first price, 2 = second price plus.
      tmax: 120, // Maximum time in milliseconds for bidders to respond.
      cur: ["USD"],
      imp: [{
        id: "1",
        banner: { format: [{ w: 300, h: 250 }] },
        bidfloor: 0.01, // Minimum bid, in CPM.
        bidfloorcur: "USD",
        secure: 1, // 1 = the creative must be served over HTTPS.
      }],
      site: {
        id: "site-example-news",
        domain: "example-news.test",
        page: "https://example-news.test/technology/article",
        publisher: { id: "pub-example" },
      },
      device: {
        devicetype: 1, // AdCOM device type: 1 = Mobile/Tablet (4 = Phone, 5 = Tablet).
        geo: { country: "USA" }, // ISO 3166-1 alpha-3 country code.
      },
    };
  }

  return {
    DEFAULT_ADVERTISERS: DEFAULT_ADVERTISERS,
    MAX_BID_CPM: MAX_BID_CPM,
    MAX_BID_CENTS: MAX_BID_CENTS,
    MAX_ADVERTISERS: MAX_ADVERTISERS,
    MAX_NAME_LENGTH: MAX_NAME_LENGTH,
    BID_PATTERN: BID_PATTERN,
    formatUsd: formatUsd,
    formatPerImpression: formatPerImpression,
    toCents: toCents,
    validateName: validateName,
    validateBid: validateBid,
    validateAdvertiser: validateAdvertiser,
    runAuctionLogic: runAuctionLogic,
    buildBidRequest: buildBidRequest,
  };
});
