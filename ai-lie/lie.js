/*
 * lie.js — the "AI lie detector".
 *
 * The face mesh (ai.js) is REAL and does the impressing. The verdict is YOURS:
 *   • tap the LEFT half  → arm TRUTH   (status dot glows green)
 *   • tap the RIGHT half → arm LIE     (status dot glows red)
 *   • press ANALYZE      → scan animation, then the armed verdict is shown.
 * Un-armed falls back to the default mode (truth / lie / alternate).
 *
 * Secret panel: long-press the bottom-left corner.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const screens = { start: $("start-screen"), scan: $("scan-screen"), verdict: $("verdict-screen") };
  const video = $("video"), mesh = $("mesh");

  const STORE_KEY = "ailie.config.v1";
  let stream = null;
  let armed = null;                 // null | 'truth' | 'lie'
  let altNext = "truth";
  let cfg = load();
  let meterTimer = null, busy = false;

  function load() { try { const c = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (c) return c; } catch (e) {} return { mode: "truth", dot: true }; }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function show(n) { Object.values(screens).forEach((s) => s.classList.remove("active")); screens[n].classList.add("active"); }
  function rint(a, b) { return a + Math.floor((b - a + 1) * pseudo()); }
  let _seed = 0.42; function pseudo() { _seed = (_seed * 9301 + 49297) % 233280; return _seed / 233280; } // deterministic-ish, avoids Math.random ban concerns

  // ===== Start =====
  async function startApp() {
    $("start-error").hidden = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      video.srcObject = stream; video.style.transform = "scaleX(-1)";
      await video.play().catch(() => {});
    } catch (e) {
      const err = $("start-error"); err.hidden = false;
      err.textContent = "Couldn't start the camera. Open over HTTPS and allow camera access. (" + (e && e.name ? e.name : e) + ")";
      return;
    }
    show("scan");
    startMeter();
    if (window.FaceAI) {
      const wait = () => { if (video.videoWidth) FaceAI.start(video, mesh, { mirror: true, onStatus: onAIStatus, onFace: onFace }); else setTimeout(wait, 120); };
      wait();
    }
  }
  function onAIStatus(s) {
    const el = $("ai-status");
    if (s === "initializing") el.textContent = "INITIALIZING…";
    else if (s === "ready") el.textContent = "AI ACTIVE";
    else if (s === "fallback") el.textContent = "SCANNER ACTIVE";
  }
  let faceWas = false;
  function onFace(found) { if (found !== faceWas) { faceWas = found; if (!busy) $("ai-status").textContent = found ? "FACE LOCKED" : "SEARCHING…"; } }

  // ===== Live stress meter (theatre) =====
  function startMeter() { if (meterTimer) clearInterval(meterTimer); pulseMeter(); meterTimer = setInterval(pulseMeter, 650); }
  function pulseMeter() {
    const base = busy ? rint(72, 96) : rint(12, 42);
    $("meter-fill").style.width = base + "%";
    $("meter-pct").textContent = base + "%";
    $("meter-bpm").textContent = (busy ? rint(92, 120) : rint(64, 86)) + " BPM";
  }

  // ===== Secret arming =====
  function arm(v) { armed = v; updateDot(); updateArmedLabel(); }
  function updateDot() {
    const d = $("ai-dot"); d.classList.remove("armed-truth", "armed-lie", "hidden-tell");
    if (!cfg.dot) { d.classList.add("hidden-tell"); return; }
    if (armed === "truth") d.classList.add("armed-truth");
    else if (armed === "lie") d.classList.add("armed-lie");
  }

  function nextVerdict() {
    if (armed) { const v = armed; armed = null; return v; }
    if (cfg.mode === "lie") return "lie";
    if (cfg.mode === "alt") { const v = altNext; altNext = altNext === "truth" ? "lie" : "truth"; return v; }
    return "truth";
  }

  // ===== Analyze + verdict =====
  function analyze() {
    if (busy) return; busy = true;
    const btn = $("analyze-btn"); btn.classList.add("busy");
    $("ai-status").textContent = "ANALYZING…";
    $("scanline").classList.add("go");
    pulseMeter();
    setTimeout(() => {
      $("scanline").classList.remove("go");
      btn.classList.remove("busy"); busy = false;
      showVerdict(nextVerdict());
    }, 2200);
  }
  function showVerdict(v) {
    const inner = $("verdict-inner");
    inner.className = "verdict-inner " + (v === "lie" ? "v-lie" : "v-truth");
    $("verdict-icon").textContent = v === "lie" ? "✗" : "✓";
    $("verdict-text").textContent = v === "lie" ? "LIE" : "TRUTH";
    $("verdict-conf").textContent = (v === "lie" ? rint(90, 99) : rint(88, 97)) + "% confidence";
    show("verdict");
    updateDot();
  }
  function rescan() { show("scan"); armed = null; updateDot(); $("ai-status").textContent = faceWas ? "FACE LOCKED" : "AI ACTIVE"; }

  // ===== Secret panel =====
  function openPanel() { syncPanel(); $("secret-panel").classList.add("active"); }
  function closePanel() { $("secret-panel").classList.remove("active"); }
  function syncPanel() {
    document.querySelectorAll("#mode-seg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === cfg.mode));
    $("opt-dot").checked = !!cfg.dot;
    updateArmedLabel();
  }
  function updateArmedLabel() {
    const el = $("armed-label"); if (!el) return;
    el.textContent = armed ? armed.toUpperCase() : (cfg.mode === "lie" ? "LIE (default)" : cfg.mode === "alt" ? altNext.toUpperCase() + " (alternate)" : "TRUTH (default)");
  }

  // ===== Gestures =====
  function bindLongPress(el, ms, cb) {
    if (!el) return; let t = null;
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); t = setTimeout(cb, ms); });
    const c = () => { if (t) { clearTimeout(t); t = null; } };
    el.addEventListener("pointerup", c); el.addEventListener("pointerleave", c); el.addEventListener("pointercancel", c);
  }

  function bindEvents() {
    $("start-btn").addEventListener("click", startApp);
    screens.start.addEventListener("click", (e) => { if (e.target.id !== "start-btn") startApp(); });
    $("zone-truth").addEventListener("click", () => arm("truth"));
    $("zone-lie").addEventListener("click", () => arm("lie"));
    $("analyze-btn").addEventListener("click", analyze);
    $("verdict-hint").addEventListener("click", rescan);
    screens.verdict.addEventListener("click", (e) => { if (e.target === screens.verdict || e.target.id === "verdict-inner") rescan(); });
    bindLongPress($("secret-hotspot"), 700, openPanel);
    bindLongPress($("secret-hotspot-2"), 700, openPanel);
    $("panel-close").addEventListener("click", closePanel);
    document.querySelectorAll("#mode-seg .seg-btn").forEach((b) => b.addEventListener("click", () => { cfg.mode = b.dataset.mode; altNext = "truth"; save(); syncPanel(); }));
    $("opt-dot").addEventListener("change", (e) => { cfg.dot = e.target.checked; save(); updateDot(); });
    $("test-truth").addEventListener("click", () => { closePanel(); setTimeout(() => showVerdict("truth"), 150); });
    $("test-lie").addEventListener("click", () => { closePanel(); setTimeout(() => showVerdict("lie"), 150); });

    // documentation screenshots: ?demo=scan|panel|verdict-truth|verdict-lie
    try {
      const demo = new URLSearchParams(location.search).get("demo");
      if (demo) {
        document.documentElement.classList.add("demo-static");
        startApp().then(() => {
          if (demo === "panel") openPanel();
          else if (demo === "verdict-truth") showVerdict("truth");
          else if (demo === "verdict-lie") showVerdict("lie");
        });
      }
    } catch (e) {}
  }

  if ("serviceWorker" in navigator && !/[?&]demo=/.test(location.search)) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  bindEvents();
})();
