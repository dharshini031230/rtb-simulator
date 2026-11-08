/*
 * AdTech Playground: RTB Auction Simulator — UI layer
 * ---------------------------------------------------
 * This file owns application state, DOM rendering, the timeline animation
 * and event wiring. All auction maths (validation, integer cents, ranking,
 * tie-breaking, first-price pricing, no-fill) lives in auction-core.js and is
 * reached through window.AuctionCore, so it can be tested without a browser.
 *
 * Everything runs locally in the browser. No network requests are made.
 */

(function () {
  "use strict";

  const Core = window.AuctionCore;
  const DEFAULT_ADVERTISERS = Core.DEFAULT_ADVERTISERS;
  const MAX_ADVERTISERS = Core.MAX_ADVERTISERS;
  const MAX_NAME_LENGTH = Core.MAX_NAME_LENGTH;
  const formatUsd = Core.formatUsd;
  const formatPerImpression = Core.formatPerImpression;

  // The animation pause per timeline stage. It exists only so a human can follow along
  // and is unrelated to real RTB latency. Reduced-motion users get no pause.
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const ANIMATION_STEP_MS = 550;
  function stepDelay() {
    return reducedMotionQuery.matches ? 0 : ANIMATION_STEP_MS;
  }

  // ---------- State ----------

  let advertisers = [];
  let nextId = 1;
  let isRunning = false;
  let auctionCount = 0;
  let currentRequestJson = "";

  // ---------- DOM references ----------

  const els = {
    list: document.getElementById("advertiser-list"),
    count: document.getElementById("advertiser-count"),
    formMessage: document.getElementById("form-message"),
    addBtn: document.getElementById("add-btn"),
    runBtn: document.getElementById("run-btn"),
    resetBtn: document.getElementById("reset-btn"),
    results: document.getElementById("results"),
    resultsMeta: document.getElementById("results-meta"),
    timeline: document.getElementById("timeline"),
    timelineMeta: document.getElementById("timeline-meta"),
    timelineSummary: document.getElementById("timeline-summary"),
    bidRequest: document.getElementById("bid-request"),
    requestMeta: document.getElementById("request-meta"),
    copyBtn: document.getElementById("copy-btn"),
    copyStatus: document.getElementById("copy-status"),
    status: document.getElementById("status"),
  };

  // ---------- Helpers ----------

  function createAdvertiser(name, bid) {
    return { id: nextId++, name: name, bid: bid };
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Used only to produce ILLUSTRATIVE timestamps. Nothing is measured.
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // textContent prevents HTML injection from names
    return node;
  }

  function announce(message) {
    els.status.textContent = message;
  }

  function displayName(adv, i) {
    return adv.name.trim() || "advertiser " + (i + 1);
  }

  // ---------- Rendering: advertiser form ----------

  function buildField(opts) {
    const field = el("div", "field " + opts.className);
    const label = el("label", "field-label");
    label.htmlFor = opts.inputId;
    label.append(el("span", "sr-only", "Advertiser " + (opts.position + 1) + " "), opts.labelText);

    const input = el("input");
    input.id = opts.inputId;
    input.type = "text";
    input.value = opts.value;
    input.placeholder = opts.placeholder;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dataset.field = opts.field;
    if (opts.inputMode) input.inputMode = opts.inputMode;
    if (opts.maxLength) input.maxLength = opts.maxLength;

    const error = el("p", "field-error");
    error.id = opts.field + "-error-" + opts.advId;
    input.setAttribute("aria-describedby", error.id);

    if (opts.prefix) {
      const wrap = el("div", "bid-input-wrap");
      const prefix = el("span", "bid-prefix", opts.prefix);
      prefix.setAttribute("aria-hidden", "true");
      wrap.append(prefix, input);
      field.append(label, wrap, error);
    } else {
      field.append(label, input, error);
    }
    return field;
  }

  function renderAdvertisers() {
    els.list.replaceChildren();

    advertisers.forEach(function (adv, i) {
      const li = el("li", "adv-row");
      li.dataset.id = adv.id;

      const index = el("div", "adv-index", String(i + 1));
      index.setAttribute("aria-hidden", "true");

      const nameField = buildField({
        className: "name-field", field: "name", advId: adv.id, position: i,
        inputId: "name-" + adv.id, labelText: "name", value: adv.name,
        placeholder: "Advertiser name", maxLength: MAX_NAME_LENGTH + 10,
      });

      const bidField = buildField({
        className: "bid-field", field: "bid", advId: adv.id, position: i,
        inputId: "bid-" + adv.id, labelText: "bid (USD CPM)", value: adv.bid,
        placeholder: "0.00", inputMode: "decimal", prefix: "$",
      });

      const removeCell = el("div", "remove-cell");
      const removeBtn = el("button", "btn btn-danger-ghost", "Remove");
      removeBtn.type = "button";
      removeBtn.dataset.action = "remove";
      removeBtn.setAttribute("aria-label", "Remove " + displayName(adv, i));
      removeCell.append(removeBtn);

      li.append(index, nameField, bidField, removeCell);
      els.list.append(li);
    });

    updateControls();
  }

  function updateControls() {
    els.count.textContent = advertisers.length + " / " + MAX_ADVERTISERS + " advertisers";
    els.addBtn.disabled = isRunning || advertisers.length >= MAX_ADVERTISERS;
    els.runBtn.disabled = isRunning;
    els.resetBtn.disabled = isRunning;
    els.copyBtn.disabled = currentRequestJson === "";
    els.list.querySelectorAll("input, button").forEach(function (node) {
      node.disabled = isRunning;
    });
  }

  // Shows inline validation errors for each row. Returns true when all rows are valid.
  function showValidation() {
    let allValid = true;
    advertisers.forEach(function (adv) {
      const check = Core.validateAdvertiser(adv);
      document.getElementById("name-error-" + adv.id).textContent = check.nameError;
      document.getElementById("bid-error-" + adv.id).textContent = check.bidError;
      document.getElementById("name-" + adv.id).setAttribute("aria-invalid", check.nameError ? "true" : "false");
      document.getElementById("bid-" + adv.id).setAttribute("aria-invalid", check.bidError ? "true" : "false");
      if (!check.valid) allValid = false;
    });
    return allValid;
  }

  function clearValidation(id, field) {
    const input = document.getElementById(field + "-" + id);
    const error = document.getElementById(field + "-error-" + id);
    if (input) input.setAttribute("aria-invalid", "false");
    if (error) error.textContent = "";
  }

  function setFormMessage(text, isError) {
    els.formMessage.textContent = text;
    els.formMessage.className = "form-message" + (isError ? " error" : "");
  }

  // ---------- Rendering: timeline ----------

  const TIMELINE_STEPS = [
    {
      actor: "Publisher",
      title: "Impression opportunity becomes available",
      desc: "A user loads a page containing a 300×250 banner slot. The publisher's ad stack decides to offer that single ad view, the impression, for programmatic sale.",
    },
    {
      actor: "SSP / exchange",
      title: "The SSP or exchange creates a bid request",
      desc: "Slot size, page URL, device type and coarse location are packaged into an OpenRTB-style JSON object, together with the auction type (at) and the response deadline (tmax).",
    },
    {
      actor: "DSPs",
      title: "DSPs evaluate the request and submit bids",
      desc: "Each demand-side platform matches the request against its campaigns' targeting and budgets, then replies with a bid response containing a CPM price, or declines to bid.",
    },
    {
      actor: "Exchange",
      title: "The exchange validates and ranks the bids",
      desc: "Malformed or out-of-range bids are rejected. The remaining bids are sorted by price, highest first, and ties are resolved by the documented tie-break rule.",
    },
    {
      actor: "Exchange → publisher",
      title: "The winning bid is selected and the impression awarded",
      desc: "The highest valid bid wins. Under first-price rules the winner pays its own bid, and its creative is returned for rendering in the slot.",
    },
  ];

  const STEP_STATE_TEXT = { "": "Pending", active: "In progress", done: "Completed" };

  function renderTimeline() {
    els.timeline.replaceChildren();
    TIMELINE_STEPS.forEach(function (step, i) {
      const li = el("li");
      li.dataset.step = i;
      const dot = el("div", "step-dot", String(i + 1));
      dot.setAttribute("aria-hidden", "true");

      const body = el("div", "step-body");
      const head = el("div", "step-head");
      const titleWrap = el("div");
      titleWrap.append(el("span", "step-actor", step.actor), el("p", "step-title", step.title));
      const time = el("span", "step-time", "t+—");
      time.title = "Illustrative timestamp, not a measurement";
      head.append(titleWrap, time);

      body.append(
        head,
        el("p", "step-desc", step.desc),
        el("p", "step-detail", ""),
        el("span", "sr-only step-state", STEP_STATE_TEXT[""])
      );
      li.append(dot, body);
      els.timeline.append(li);
    });
    els.timelineMeta.textContent = "idle";
    els.timelineSummary.textContent = "";
    els.timeline.removeAttribute("aria-busy");
  }

  function setStep(i, state, time, detail) {
    const li = els.timeline.querySelector('[data-step="' + i + '"]');
    li.className = state;
    li.querySelector(".step-state").textContent = STEP_STATE_TEXT[state];
    if (state === "done") li.querySelector(".step-dot").textContent = "✓";
    if (time !== undefined) li.querySelector(".step-time").textContent = "t+" + time + "ms";
    if (detail !== undefined) li.querySelector(".step-detail").textContent = detail;
  }

  // ---------- Rendering: results ----------

  function renderEmptyResults() {
    const empty = el("div", "empty-state");
    empty.append("No auction has run yet. Configure bids and press ");
    empty.append(el("code", null, "Run auction"));
    empty.append(".");
    els.results.replaceChildren(empty);
    els.resultsMeta.textContent = "awaiting auction";
  }

  function statItem(label, value) {
    const item = el("div", "stat");
    item.append(el("dt", null, label), el("dd", null, value));
    return item;
  }

  function renderWinnerCard(outcome) {
    const w = outcome.winner;
    const card = el("div", "winner");
    const head = el("div", "winner-head");

    const left = el("div");
    left.append(
      el("div", "label", "✓ Winning advertiser"),
      el("p", "name", w.name),
      el("p", "winner-sub", "Submission #" + (w.index + 1) + " of " + outcome.totalBids)
    );

    const right = el("dl", "price");
    const bidRow = el("div");
    bidRow.append(el("dt", "label", "Winning CPM bid"), el("dd", "value", formatUsd(outcome.clearingPriceCents)));
    const perRow = el("div");
    perRow.append(el("dt", "label", "Est. cost of this impression"), el("dd", "sub", formatPerImpression(outcome.clearingPriceCents)));
    right.append(bidRow, perRow);

    head.append(left, right);

    // Spell out the first-price rule using this auction's real numbers.
    const rule = el("p", "pricing-rule");
    rule.append(el("strong", null, "First-price rule: "));
    let text = w.name + " pays its own submitted bid of " + formatUsd(w.cents) + " CPM, which is " +
      formatPerImpression(w.cents) + " for this single impression (CPM ÷ 1,000).";
    if (outcome.runnerUp) {
      text += " The runner-up bid (" + formatUsd(outcome.runnerUp.cents) + ") does not affect the price.";
    }
    rule.append(text);

    card.append(head, rule);
    return card;
  }

  function renderNoFillCard(outcome) {
    const card = el("div", "winner no-fill");
    const reason = outcome.noFillReason === "NO_BIDDERS"
      ? "No advertisers took part, so there was nothing to evaluate."
      : "All " + outcome.totalBids + " bid(s) were rejected during validation. The impression goes unsold. Fix the rejected entries below and run the auction again.";
    card.append(
      el("div", "label", "○ No fill · " + outcome.noFillReason),
      el("p", "name", "No valid bids were received"),
      el("p", "winner-sub", reason)
    );
    return card;
  }

  function renderTieNotice(outcome) {
    if (!outcome.winner) return null;
    const box = el("div", "notice" + (outcome.tiedBids.length ? " is-tie" : ""));
    box.append(el("strong", null, outcome.tiedBids.length ? "= Tie detected. " : "Tie-break check: "));
    if (outcome.tiedBids.length) {
      const names = outcome.tiedBids.map(function (b) {
        return b.name + " (#" + (b.index + 1) + ")";
      }).join(", ");
      box.append(
        outcome.tiedBids.length + " bids are equal at " + formatUsd(outcome.winner.cents) + " CPM: " + names +
        ". Rule: the earliest advertiser in submission order wins, so " + outcome.winner.name + " takes the impression."
      );
    } else {
      box.append("No tie. The highest bid was unique. If bids were equal, the earliest advertiser in submission order would win.");
    }
    return box;
  }

  function renderRanking(outcome) {
    const frag = document.createDocumentFragment();
    if (!outcome.validBids.length) return frag;

    const topCents = outcome.winner.cents;
    const tiedIds = outcome.tiedBids.map(function (b) { return b.id; });

    frag.append(el("h3", "ranking-title", "Competing bids · ranked highest to lowest"));
    const ranking = el("ol", "ranking");

    outcome.validBids.forEach(function (bid, i) {
      const isWinner = i === 0;
      const isTie = tiedIds.indexOf(bid.id) !== -1;
      let stateClass = "is-loser";
      let badge;
      if (isWinner) {
        stateClass = "is-winner";
        badge = el("span", "badge win", isTie ? "✓ Won · tie-break" : "✓ Won");
      } else if (isTie) {
        stateClass = "is-tie";
        badge = el("span", "badge tie", "= Tied · lost");
      } else {
        badge = el("span", "badge lose", "× Lost");
      }

      const item = el("li", "rank-item " + stateClass);
      const top = el("div", "rank-top");
      const nameWrap = el("div", "rank-name-wrap");
      nameWrap.append(el("span", "rank-name", bid.name), el("span", "rank-sub", "submission #" + (bid.index + 1)));
      top.append(
        el("span", "rank-pos", "#" + (i + 1)),
        nameWrap,
        badge,
        el("span", "rank-bid", formatUsd(bid.cents))
      );

      const bar = el("div", "bar");
      bar.setAttribute("aria-hidden", "true");
      const fill = el("span");
      fill.style.width = "0%";
      bar.append(fill);
      item.append(top, bar);
      ranking.append(item);

      // Bar length is relative to the winning bid. Animated after insertion.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { fill.style.width = Math.max(4, (bid.cents / topCents) * 100) + "%"; });
      });
    });

    frag.append(ranking);
    return frag;
  }

  function renderRejected(outcome) {
    const frag = document.createDocumentFragment();
    if (!outcome.rejectedBids.length) return frag;

    frag.append(el("h3", "ranking-title", "Rejected bids · " + outcome.rejectedBids.length + " excluded from ranking"));
    const list = el("ol", "ranking");

    outcome.rejectedBids.forEach(function (bid) {
      const item = el("li", "rank-item is-invalid");
      const top = el("div", "rank-top");
      const nameWrap = el("div", "rank-name-wrap");
      nameWrap.append(el("span", "rank-name", bid.name), el("span", "rank-sub", "submission #" + (bid.index + 1)));
      top.append(
        el("span", "rank-pos", "—"),
        nameWrap,
        el("span", "badge invalid", "! Rejected"),
        el("span", "rank-bid", bid.rawBid ? bid.rawBid : "(empty)")
      );
      item.append(top);

      const errors = el("ul", "rank-errors");
      bid.errors.forEach(function (error) {
        const li = el("li");
        li.append(el("code", null, error.code), " " + error.message);
        errors.append(li);
      });
      item.append(errors);
      list.append(item);
    });

    frag.append(list);
    return frag;
  }

  function renderResults(outcome) {
    const frag = document.createDocumentFragment();

    frag.append(outcome.winner ? renderWinnerCard(outcome) : renderNoFillCard(outcome));

    const stats = el("dl", "stats");
    stats.append(
      statItem("Bids received", String(outcome.totalBids)),
      statItem("Valid", String(outcome.validBids.length)),
      statItem("Rejected", String(outcome.rejectedBids.length)),
      statItem("Clearing price", outcome.winner ? formatUsd(outcome.clearingPriceCents) : "—")
    );
    frag.append(stats);

    const tie = renderTieNotice(outcome);
    if (tie) frag.append(tie);

    frag.append(renderRanking(outcome), renderRejected(outcome));

    els.results.replaceChildren(frag);
    els.resultsMeta.textContent = "auction #" + auctionCount + " · " + outcome.status;
  }

  // ---------- Bid request panel ----------

  function showBidRequest(request) {
    currentRequestJson = JSON.stringify(request, null, 2);
    els.bidRequest.textContent = currentRequestJson;
    const generatedAt = new Date();
    els.requestMeta.textContent = "";
    const time = el("time", null, generatedAt.toLocaleTimeString());
    time.dateTime = generatedAt.toISOString();
    els.requestMeta.append("Generated at ", time, " for auction #" + auctionCount + " · displayed locally, never transmitted");
    els.copyStatus.textContent = "";
    updateControls();
  }

  function clearBidRequest() {
    currentRequestJson = "";
    els.bidRequest.textContent = "// Run an auction to generate an illustrative bid request.";
    els.requestMeta.textContent = "No request generated yet.";
    els.copyStatus.textContent = "";
  }

  // Fallback for contexts where the async Clipboard API is unavailable (e.g. sandboxed iframes).
  function legacyCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    area.remove();
    return ok;
  }

  async function copyBidRequest() {
    if (!currentRequestJson) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(currentRequestJson);
        ok = true;
      }
    } catch (e) {
      ok = false;
    }
    if (!ok) ok = legacyCopy(currentRequestJson);

    if (ok) {
      els.copyStatus.textContent = "Copied JSON to clipboard.";
      els.copyBtn.textContent = "Copied";
      setTimeout(function () { els.copyBtn.textContent = "Copy JSON"; }, 1600);
    } else {
      // Last resort: select the JSON so the user can copy it manually.
      const range = document.createRange();
      range.selectNodeContents(els.bidRequest);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      els.copyStatus.textContent = "Clipboard access is blocked here. The JSON is selected, so press Ctrl+C or Cmd+C to copy it.";
    }
  }

  // ---------- Auction flow (drives the timeline) ----------

  async function submitAuction() {
    if (isRunning) return;

    if (advertisers.length === 0) {
      setFormMessage("Add at least one advertiser before running an auction.", true);
      announce("Add at least one advertiser before running an auction.");
      return;
    }

    const allValid = showValidation();
    setFormMessage(
      allValid ? "" : "Some entries are invalid. They will be rejected from this auction. See the messages under each field.",
      !allValid
    );

    isRunning = true;
    auctionCount += 1;
    updateControls();
    renderTimeline();
    els.timeline.setAttribute("aria-busy", "true");
    els.timelineMeta.textContent = "running…";
    announce("Auction " + auctionCount + " started.");

    // Snapshot the inputs so edits mid-animation can't change the outcome.
    const snapshot = advertisers.map(function (a) { return { id: a.id, name: a.name, bid: a.bid }; });
    const outcome = Core.runAuctionLogic(snapshot);
    const request = Core.buildBidRequest();

    // ILLUSTRATIVE timestamps drawn from fixed ranges. They show the typical order
    // and rough proportions of each stage. They are not measured latencies.
    let t = 0;

    setStep(0, "active");
    await wait(stepDelay());
    setStep(0, "done", t, "imp.id=1 · banner 300x250 · site example-news.test");

    t += randomInt(2, 6);
    setStep(1, "active");
    showBidRequest(request);
    await wait(stepDelay());
    setStep(1, "done", t, "id " + request.id + " · at=" + request.at + " · tmax=" + request.tmax + "ms · addressed to " + snapshot.length + " simulated bidder(s)");

    t += randomInt(35, 90);
    setStep(2, "active");
    await wait(stepDelay());
    setStep(2, "done", t, outcome.totalBids + " bid(s) received before the tmax deadline");

    t += randomInt(1, 4);
    setStep(3, "active");
    await wait(stepDelay());
    setStep(3, "done", t,
      outcome.validBids.length + " valid · " + outcome.rejectedBids.length + " rejected" +
      (outcome.tiedBids.length ? " · tie resolved by submission order" : ""));

    t += randomInt(1, 3);
    setStep(4, "active");
    await wait(stepDelay());
    setStep(4, "done", t, outcome.winner
      ? outcome.winner.name + " wins and pays " + formatUsd(outcome.winner.cents) + " CPM"
      : "No valid bids · no-fill, impression unsold");

    els.timeline.removeAttribute("aria-busy");
    els.timelineMeta.textContent = "illustrative total t+" + t + "ms";
    const animationMs = stepDelay() * TIMELINE_STEPS.length;
    els.timelineSummary.textContent =
      "Illustrative RTB total: " + t + "ms (simulated, within tmax " + request.tmax + "ms). " +
      "Animation playback: " + (animationMs / 1000).toFixed(2) + "s, slowed down so you can follow each stage.";
    renderResults(outcome);

    isRunning = false;
    updateControls();
    announce(outcome.winner
      ? "Auction " + auctionCount + " complete. " + outcome.winner.name + " won with " + formatUsd(outcome.winner.cents) + " CPM. " +
        outcome.rejectedBids.length + " bid(s) rejected."
      : "Auction " + auctionCount + " complete. No fill: no valid bids were received.");
  }

  // ---------- Actions ----------

  function addAdvertiser() {
    if (advertisers.length >= MAX_ADVERTISERS) {
      setFormMessage("Maximum of " + MAX_ADVERTISERS + " advertisers reached.", true);
      return;
    }
    const label = "Advertiser " + (advertisers.length + 1);
    const adv = createAdvertiser(label, "1.00");
    advertisers.push(adv);
    renderAdvertisers();
    setFormMessage(advertisers.length >= MAX_ADVERTISERS ? "Maximum of " + MAX_ADVERTISERS + " advertisers reached." : "", false);
    const input = document.getElementById("name-" + adv.id);
    input.focus();
    input.select();
    announce(label + " added. " + advertisers.length + " of " + MAX_ADVERTISERS + " advertisers.");
  }

  function removeAdvertiser(id) {
    const index = advertisers.findIndex(function (a) { return a.id === id; });
    if (index === -1) return;
    const removed = advertisers.splice(index, 1)[0];
    renderAdvertisers();
    setFormMessage("", false);
    announce((removed.name.trim() || "Advertiser") + " removed. " + advertisers.length + " of " + MAX_ADVERTISERS + " advertisers.");

    // Keep keyboard focus in a sensible place after removal.
    const rows = els.list.querySelectorAll(".adv-row");
    const target = rows[Math.min(index, rows.length - 1)];
    if (target) target.querySelector('[data-action="remove"]').focus();
    else els.addBtn.focus();
  }

  function resetAuction() {
    advertisers = DEFAULT_ADVERTISERS.map(function (d) { return createAdvertiser(d.name, d.bid); });
    auctionCount = 0;
    renderTimeline();
    renderEmptyResults();
    clearBidRequest();
    renderAdvertisers();
    setFormMessage("", false);
    announce("Simulator reset to the three default advertisers.");
  }

  // ---------- Event wiring ----------

  // Inputs update state directly (no re-render) so the cursor/focus isn't lost while typing.
  els.list.addEventListener("input", function (event) {
    const input = event.target;
    const row = input.closest(".adv-row");
    if (!row || !input.dataset.field) return;
    const adv = advertisers.find(function (a) { return a.id === Number(row.dataset.id); });
    if (!adv) return;
    adv[input.dataset.field] = input.value;
    clearValidation(adv.id, input.dataset.field);

    // Keep the Remove button's accessible name in sync with the edited name.
    if (input.dataset.field === "name") {
      const i = advertisers.indexOf(adv);
      row.querySelector('[data-action="remove"]').setAttribute("aria-label", "Remove " + displayName(adv, i));
    }
  });

  els.list.addEventListener("click", function (event) {
    const btn = event.target.closest('[data-action="remove"]');
    if (!btn) return;
    removeAdvertiser(Number(btn.closest(".adv-row").dataset.id));
  });

  // Pressing Enter inside any field runs the auction (ignoring IME composition).
  els.list.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    if (event.target.tagName !== "INPUT") return;
    event.preventDefault();
    submitAuction();
  });

  els.addBtn.addEventListener("click", addAdvertiser);
  els.runBtn.addEventListener("click", submitAuction);
  els.resetBtn.addEventListener("click", resetAuction);
  els.copyBtn.addEventListener("click", copyBidRequest);

  // ---------- Init ----------
  resetAuction();
  announce("");
})();
