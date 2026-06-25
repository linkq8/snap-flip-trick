/*
 * calc.js — a fully-working iOS-style calculator that secretly hides a
 * self-working mentalism reveal.
 *
 * The math is a FORCE: the spectator can do every step on this real calculator,
 * yet always lands on the same outcome. The magician guides the patter, then
 * triggers a reveal (long-press the TOP-RIGHT corner) that the audience never expects.
 *
 *  • Routine "elephant" → the classic force to 4 → D → Denmark → Elephant → Grey.
 *  • Routine "number"   → (n×2 + C) ÷ 2 − n = C/2, shown as a "sealed prediction".
 *
 * Secret setup panel: long-press the TOP-LEFT corner.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const displayEl = $("display-value");
  const overlay = $("reveal-overlay");
  const revealPath = $("reveal-path");
  const revealG = $("reveal-g");
  const penTip = $("pen-tip");

  const STORE_KEY = "mindcalc.config.v1";

  // ===== Routines =====
  const NUMBER_PRESETS = [
    { id: "n5", add: 10, answer: 5 },
    { id: "n7", add: 14, answer: 7 },
    { id: "n10", add: 20, answer: 10 },
  ];
  const ELEPHANT_STEPS = [
    "Think of a number 1–9 (keep it secret).",
    "Multiply it by 9.",
    "Two digits? Add the two digits together.",
    "Subtract 5.",
    "Turn it into a letter: 1=A, 2=B, 3=C, 4=D…",
    "Think of a COUNTRY starting with that letter.",
    "Take the country's 2nd letter → think of an ANIMAL starting with it.",
    "Picture that animal's COLOUR.",
  ];
  function numberSteps(p) {
    return [
      "Think of ANY number (keep it secret).",
      "Multiply it by 2.",
      "Add " + p.add + ".",
      "Divide by 2.",
      "Subtract your original number.",
      "Hold that final number in your mind.",
    ];
  }

  // ===== Config (persisted) =====
  const DEFAULTS = { routine: "elephant", preset: "n5" };
  let config = loadConfig();
  function loadConfig() {
    try {
      const c = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (c && (c.routine === "elephant" || c.routine === "number")) {
        return { routine: c.routine, preset: c.preset || "n5" };
      }
    } catch (e) {}
    return Object.assign({}, DEFAULTS);
  }
  function saveConfig() { try { localStorage.setItem(STORE_KEY, JSON.stringify(config)); } catch (e) {} }
  function activePreset() { return NUMBER_PRESETS.find((p) => p.id === config.preset) || NUMBER_PRESETS[0]; }

  // ============================================================
  // 1) REAL CALCULATOR
  // ============================================================
  let displayValue = "0";
  let firstOperand = null;
  let operator = null;
  let waitingForSecond = false;

  function refresh() {
    displayEl.textContent = formatForDisplay(displayValue);
    document.querySelectorAll(".key.op").forEach((b) => b.classList.remove("is-active"));
    if (operator && waitingForSecond) {
      const b = document.querySelector('.key.op[data-op="' + operator + '"]');
      if (b) b.classList.add("is-active");
    }
    const ac = document.querySelector('[data-action="clear"]');
    if (ac) ac.textContent = (displayValue !== "0" || operator || firstOperand != null) ? "C" : "AC";
  }

  function formatForDisplay(v) {
    if (v === "Error") return v;
    let [intp, decp] = String(v).split(".");
    const neg = intp.startsWith("-");
    if (neg) intp = intp.slice(1);
    intp = intp.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + intp + (decp != null ? "." + decp : "");
  }

  function inputDigit(d) {
    if (waitingForSecond) { displayValue = d; waitingForSecond = false; }
    else { displayValue = displayValue === "0" ? d : displayValue + d; }
    refresh();
  }
  function inputDecimal() {
    if (waitingForSecond) { displayValue = "0."; waitingForSecond = false; refresh(); return; }
    if (!displayValue.includes(".")) displayValue += ".";
    refresh();
  }
  function clearAll() {
    displayValue = "0"; firstOperand = null; operator = null; waitingForSecond = false;
    refresh();
  }
  function negate() { displayValue = trimNum(parseFloat(displayValue) * -1); refresh(); }
  function percent() { displayValue = trimNum(parseFloat(displayValue) / 100); refresh(); }

  function compute(a, b, op) {
    let r;
    switch (op) {
      case "+": r = a + b; break;
      case "−": r = a - b; break;
      case "×": r = a * b; break;
      case "÷": r = b === 0 ? NaN : a / b; break;
      default: return b;
    }
    return r;
  }
  function trimNum(n) {
    if (!isFinite(n)) return "Error";
    // kill binary float dust, keep up to 9 significant digits
    return String(parseFloat(n.toPrecision(12)));
  }
  function handleOperator(nextOp) {
    const inputVal = parseFloat(displayValue);
    if (nextOp === "=") {
      if (operator != null && !waitingForSecond) {
        displayValue = trimNum(compute(firstOperand, inputVal, operator));
        firstOperand = null; operator = null; waitingForSecond = true;
        refresh();
      }
      return;
    }
    if (operator != null && waitingForSecond) { operator = nextOp; refresh(); return; }
    if (firstOperand == null) { firstOperand = inputVal; }
    else if (operator != null) {
      const r = compute(firstOperand, inputVal, operator);
      displayValue = trimNum(r); firstOperand = parseFloat(displayValue);
    }
    waitingForSecond = true; operator = nextOp; refresh();
  }

  function onKey(btn) {
    if (btn.dataset.num != null) return inputDigit(btn.dataset.num);
    if (btn.dataset.op != null) return handleOperator(btn.dataset.op);
    const a = btn.dataset.action;
    if (a === "clear") return clearAll();
    if (a === "negate") return negate();
    if (a === "percent") return percent();
    if (a === "decimal") return inputDecimal();
  }

  // ============================================================
  // 2) REVEAL
  // ============================================================
  let drawing = false;
  function showReveal(routine) {
    routine = routine || config.routine;
    overlay.hidden = false;
    const eleEl = $("reveal-elephant");
    const numEl = $("reveal-number");
    const svg = $("reveal-svg");

    if (routine === "elephant") {
      eleEl.hidden = false; numEl.hidden = true; svg.style.display = "none";
      clearDraw(revealPath, penTip);
      // retrigger the entrance animation
      eleEl.style.animation = "none"; void eleEl.offsetWidth; eleEl.style.animation = "";
    } else {
      eleEl.hidden = true; numEl.hidden = false; svg.style.display = "block";
      $("reveal-caption").textContent = "My prediction was…";
      const ans = activePreset().answer;
      clearDraw(revealPath, penTip);
      setNumber(revealPath, revealG, String(ans));
      // small delay so the caption lands first
      drawing = true;
      setTimeout(() => { animateDraw(revealPath, penTip, 420, () => { drawing = false; }); }, 360);
    }
  }
  function hideReveal() {
    if (drawing) return; // let the pen finish
    overlay.hidden = true;
    clearDraw(revealPath, penTip);
  }

  // ============================================================
  // 3) SECRET PANEL
  // ============================================================
  function openPanel() { syncPanel(); $("secret-panel").classList.add("active"); }
  function closePanel() { $("secret-panel").classList.remove("active"); }

  function syncPanel() {
    document.querySelectorAll("#routine-seg .seg-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.routine === config.routine));
    $("number-options").style.display = config.routine === "number" ? "block" : "none";
    // number presets
    const seg = $("number-seg");
    if (!seg.dataset.built) {
      seg.innerHTML = NUMBER_PRESETS.map((p) =>
        '<button class="seg-btn" data-preset="' + p.id + '">→ ' + p.answer + "</button>").join("");
      seg.dataset.built = "1";
      seg.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => {
        config.preset = b.dataset.preset; saveConfig(); syncPanel();
      }));
    }
    seg.querySelectorAll(".seg-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.preset === config.preset));
    buildCheat();
  }

  function buildCheat() {
    const el = $("cheat-card");
    let steps, answer;
    if (config.routine === "elephant") { steps = ELEPHANT_STEPS; answer = "GREY ELEPHANT · from DENMARK 🐘"; }
    else { const p = activePreset(); steps = numberSteps(p); answer = String(p.answer); }
    el.innerHTML =
      steps.map((s, i) => "<div><b>" + (i + 1) + ".</b> " + s + "</div>").join("") +
      '<span class="answer">They will always reach → ' + answer + "</span>";
  }

  // ============================================================
  // 4) GESTURES
  // ============================================================
  function bindLongPress(el, ms, cb) {
    if (!el) return;
    let timer = null;
    const start = (e) => { if (e) e.preventDefault(); timer = setTimeout(cb, ms); };
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);
  }

  function bindEvents() {
    document.querySelectorAll(".key").forEach((b) =>
      b.addEventListener("click", () => onKey(b)));

    bindLongPress($("settings-hotspot"), 700, openPanel);
    bindLongPress($("reveal-hotspot"), 450, () => showReveal());

    overlay.addEventListener("click", hideReveal);
    $("panel-close").addEventListener("click", closePanel);
    $("test-reveal").addEventListener("click", () => { closePanel(); setTimeout(() => showReveal(), 250); });

    document.querySelectorAll("#routine-seg .seg-btn").forEach((b) =>
      b.addEventListener("click", () => { config.routine = b.dataset.routine; saveConfig(); syncPanel(); }));

    // desktop keyboard (handy for testing)
    window.addEventListener("keydown", (e) => {
      if ($("secret-panel").classList.contains("active")) return;
      const k = e.key;
      if (k >= "0" && k <= "9") inputDigit(k);
      else if (k === ".") inputDecimal();
      else if (k === "+" || k === "-") handleOperator(k === "+" ? "+" : "−");
      else if (k === "*") handleOperator("×");
      else if (k === "/") { e.preventDefault(); handleOperator("÷"); }
      else if (k === "Enter" || k === "=") handleOperator("=");
      else if (k === "Escape" || k === "c" || k === "C") clearAll();
      else if (k === "r" || k === "R") showReveal();     // test reveal
      else if (k === "s" || k === "S") openPanel();       // test panel
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }

  refresh();
  bindEvents();
})();
