/*
 * card.js — a real camera that secretly reveals a thought-of playing card.
 *
 * The spectator names any card out loud. While the phone faces YOU, you set that
 * card with two invisible tap zones (left half = rank, right half = suit); a tiny
 * readout disguised as camera info confirms the current card. Press the shutter:
 * the photo is "taken" and the exact card develops onto it.
 *
 * Secret setup panel: long-press the bottom-left corner (also has a tap picker).
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const screens = { start: $("start-screen"), camera: $("camera-screen"), reveal: $("reveal-screen") };
  const video = $("video"), photo = $("photo");

  const STORE_KEY = "mindcam.config.v1";
  let stream = null, facing = "environment";
  let rankIdx = 0, suitKey = "S";
  let opts = loadOpts();

  function loadOpts() {
    try { const o = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (o) return o; } catch (e) {}
    return { readout: true, force: false };
  }
  function saveOpts() { try { localStorage.setItem(STORE_KEY, JSON.stringify(opts)); } catch (e) {} }

  function show(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // ===== Start + camera =====
  async function startApp() {
    $("start-error").hidden = true;
    try { await startCamera(facing); }
    catch (e) {
      const err = $("start-error"); err.hidden = false;
      err.textContent = "Couldn't start the camera. Open over HTTPS and allow camera access. (" + (e && e.name ? e.name : e) + ")";
      return;
    }
    updateCard();
    show("camera");
  }
  async function startCamera(f) {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: f }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    video.srcObject = stream; facing = f;
    video.style.transform = f === "user" ? "scaleX(-1)" : "none";
    await video.play().catch(() => {});
  }
  function flip() { startCamera(facing === "environment" ? "user" : "environment").catch(() => {}); }

  // ===== Card state =====
  function updateCard() {
    const label = cardLabel(rankIdx, suitKey);
    $("exif-card").textContent = label;
    $("exif").style.display = opts.readout ? "" : "none";
    const cc = $("current-card"); if (cc) cc.textContent = label;
    syncPicker();
  }
  function cycleRank() { rankIdx = (rankIdx + 1) % RANKS.length; updateCard(); }
  function cycleSuit() { suitKey = SUIT_ORDER[(SUIT_ORDER.indexOf(suitKey) + 1) % SUIT_ORDER.length]; updateCard(); }

  // ===== Capture + reveal =====
  function capture() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh) {
      photo.width = vw; photo.height = vh;
      const ctx = photo.getContext("2d");
      ctx.save();
      if (facing === "user") { ctx.translate(vw, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, vw, vh);
      ctx.restore();
    }
    revealCard();
  }
  function revealCard() {
    show("reveal");
    const holder = $("card-holder");
    holder.innerHTML = cardSVG(rankIdx, suitKey);
    const svg = holder.firstChild; svg.classList.add("card-anim");
    // camera flash
    const fl = document.createElement("div"); fl.className = "flash go";
    screens.reveal.appendChild(fl);
    setTimeout(() => { try { screens.reveal.removeChild(fl); } catch (e) {} }, 400);
  }
  function retake() {
    show("camera");
    $("card-holder").innerHTML = "";
    if (!opts.force) { rankIdx = 0; suitKey = "S"; }  // fresh card unless in prediction mode
    updateCard();
  }

  // ===== Secret panel =====
  function openPanel() { buildPicker(); syncOpts(); updateCard(); $("secret-panel").classList.add("active"); }
  function closePanel() { $("secret-panel").classList.remove("active"); }
  function buildPicker() {
    const rr = $("pick-rank"); if (!rr.dataset.built) {
      rr.innerHTML = RANKS.map((r, i) => '<button class="pick-btn" data-rank="' + i + '">' + r + "</button>").join("");
      rr.dataset.built = "1";
      rr.querySelectorAll(".pick-btn").forEach((b) => b.addEventListener("click", () => { rankIdx = +b.dataset.rank; updateCard(); }));
    }
    const sr = $("pick-suit"); if (!sr.dataset.built) {
      sr.innerHTML = SUIT_ORDER.map((k) => '<button class="pick-btn ' + (k === "H" || k === "D" ? "red" : "") + '" data-suit="' + k + '">' + SUITS[k].sym + "</button>").join("");
      sr.dataset.built = "1";
      sr.querySelectorAll(".pick-btn").forEach((b) => b.addEventListener("click", () => { suitKey = b.dataset.suit; updateCard(); }));
    }
  }
  function syncPicker() {
    document.querySelectorAll("#pick-rank .pick-btn").forEach((b) => b.classList.toggle("active", +b.dataset.rank === rankIdx));
    document.querySelectorAll("#pick-suit .pick-btn").forEach((b) => b.classList.toggle("active", b.dataset.suit === suitKey));
  }
  function syncOpts() { $("opt-readout").checked = !!opts.readout; $("opt-force").checked = !!opts.force; }

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
    $("zone-rank").addEventListener("click", cycleRank);
    $("zone-suit").addEventListener("click", cycleSuit);
    $("shutter").addEventListener("click", capture);
    $("flip-btn").addEventListener("click", flip);
    $("flip-btn2").addEventListener("click", flip);
    $("reveal-close").addEventListener("click", retake);
    $("reveal-hint").addEventListener("click", retake);
    screens.reveal.addEventListener("click", (e) => { if (e.target === screens.reveal || e.target.id === "photo") retake(); });
    bindLongPress($("secret-hotspot"), 700, openPanel);
    bindLongPress($("secret-hotspot-2"), 700, openPanel);
    $("panel-close").addEventListener("click", closePanel);
    $("test-reveal").addEventListener("click", () => { closePanel(); setTimeout(revealCard, 200); });
    $("opt-readout").addEventListener("change", (e) => { opts.readout = e.target.checked; saveOpts(); updateCard(); });
    $("opt-force").addEventListener("change", (e) => { opts.force = e.target.checked; saveOpts(); });

    // documentation screenshots: ?demo=camera|panel|reveal&card=QH
    try {
      const q = new URLSearchParams(location.search), demo = q.get("demo");
      if (demo) {
        const c = q.get("card"); if (c) { const m = c.match(/^(10|[2-9]|[AJQK])([SHDC])$/i); if (m) { rankIdx = RANKS.indexOf(m[1].toUpperCase()); suitKey = m[2].toUpperCase(); } }
        document.documentElement.classList.add("demo-static");
        if (demo === "panel") { startApp().then(() => openPanel()); }
        else if (demo === "reveal") { startApp().then(() => setTimeout(revealCard, 150)); }
        else { startApp(); }
      }
    } catch (e) {}
  }

  if ("serviceWorker" in navigator && !/[?&]demo=/.test(location.search)) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  bindEvents();
})();
