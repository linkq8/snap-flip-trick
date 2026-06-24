/*
 * app.js — the trick's logic
 * Flow: capture a "photo" → lay the phone face-down & still for 2s (arms silently)
 *       → lift it up from one edge → the lift edge picks a number 1–4, drawn by hand.
 */
(function () {
  "use strict";

  // ===== Element refs =====
  const $ = (id) => document.getElementById(id);
  const screens = {
    start: $("start-screen"),
    camera: $("camera-screen"),
    capture: $("capture-screen"),
  };
  const video = $("video");
  const photo = $("photo");
  const revealPath = $("reveal-path");
  const revealG = $("reveal-g");
  const penTip = $("pen-tip");
  const debugBox = $("debug");

  // ===== Settings (persisted locally) =====
  const STORE_KEY = "snapflip.config.v2";
  const DEFAULTS = {
    threshold: 60, // integrated lift rotation (degrees) needed to lock the number
    mapping: { "beta+": 1, "beta-": 2, "gamma+": 4, "gamma-": 3 },
  };
  let config = loadConfig();

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        return {
          threshold: c.threshold || DEFAULTS.threshold,
          mapping: Object.assign({}, DEFAULTS.mapping, c.mapping || {}),
        };
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  function saveConfig() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(config)); } catch (e) {}
  }

  // ===== Tuning constants for the "settle then lift" detector =====
  const SETTLE_MS = 2000;   // must stay face-down & still this long to arm
  const STILL_RATE = 12;    // deg/s — below this counts as "still"
  const FLAT_GZ = 8.5;      // m/s² — z-gravity magnitude that means "lying flat"
  const FLAT_XY = 3.6;      // m/s² — max horizontal gravity that still counts as flat

  // ===== State =====
  let stream = null;
  let currentFacing = "environment";
  let detectMode = "idle";  // 'idle' | 'waiting' (settling) | 'armed' (integrating lift)
  let isPractice = false;   // detection is for the practice display, not a real reveal
  let practiceOpen = false;
  let locked = false;       // locked — don't reveal twice
  let stillSince = null;    // timestamp when the face-down stillness began
  let accB = 0, accG = 0;   // integrated rotation around x (beta) and y (gamma)
  let lastNow = null;
  let lastBucket = "—";
  let wakeLock = null;

  const DEBUG = /[?&]debug/.test(location.search);

  // ===== Screen management =====
  function show(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // ===== Start + permissions =====
  async function startApp() {
    $("start-error").hidden = true;
    // 1) Motion permission first (must be inside a user gesture on iOS)
    await requestMotionPermission();
    attachMotionListeners();
    // 2) Camera permission
    try {
      await startCamera(currentFacing);
    } catch (e) {
      const err = $("start-error");
      err.hidden = false;
      err.textContent =
        "Couldn't start the camera. Make sure the page is opened over HTTPS and camera access is allowed. (" +
        (e && e.name ? e.name : e) + ")";
      return;
    }
    requestWakeLock();
    show("camera");
  }

  async function requestMotionPermission() {
    try {
      if (typeof DeviceMotionEvent !== "undefined" &&
          typeof DeviceMotionEvent.requestPermission === "function") {
        const r = await DeviceMotionEvent.requestPermission();
        if (typeof DeviceOrientationEvent !== "undefined" &&
            typeof DeviceOrientationEvent.requestPermission === "function") {
          try { await DeviceOrientationEvent.requestPermission(); } catch (e) {}
        }
        return r === "granted";
      }
      return true; // browsers that don't require an explicit prompt
    } catch (e) {
      return false;
    }
  }

  function attachMotionListeners() {
    window.addEventListener("devicemotion", onMotion, true);
  }

  // ===== Camera =====
  async function startCamera(facing) {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    video.srcObject = stream;
    currentFacing = facing;
    video.style.transform = facing === "user" ? "scaleX(-1)" : "none"; // mirror front cam
    await video.play().catch(() => {});
  }

  function flipCamera() {
    startCamera(currentFacing === "environment" ? "user" : "environment").catch(() => {});
  }

  // ===== Capture =====
  function capturePhoto() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    photo.width = vw;
    photo.height = vh;
    const ctx = photo.getContext("2d");
    ctx.save();
    if (currentFacing === "user") { ctx.translate(vw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, vw, vh);
    ctx.restore();

    // Begin the "settle face-down, then lift" detection cycle
    clearDraw(revealPath, penTip);
    beginWaiting(false);
    show("capture");
  }

  function closeCapture() {
    detectMode = "idle";
    locked = false;
    isPractice = false;
    clearDraw(revealPath, penTip);
    show("camera");
  }

  // ===== Detection: settle (face-down + still 2s) → lift edge =====
  function resetAccum() { accB = 0; accG = 0; lastNow = null; }

  function beginWaiting(practice) {
    detectMode = "waiting";
    isPractice = practice;
    locked = false;
    stillSince = null;
    resetAccum();
    if (practiceOpen) setStateText("place");
  }

  function onMotion(e) {
    const now = performance.now();
    let dt = lastNow == null ? 0 : (now - lastNow) / 1000;
    lastNow = now;
    if (dt <= 0 || dt > 0.5) dt = (e.interval && e.interval > 0) ? e.interval : 0.016;

    const rr = e.rotationRate || {};
    const rb = rr.beta || 0;   // rotation around x (lift from top/bottom edge)
    const rg = rr.gamma || 0;  // rotation around y (lift from left/right edge)
    const ra = rr.alpha || 0;  // rotation around z

    const ag = e.accelerationIncludingGravity || {};
    const gx = ag.x || 0, gy = ag.y || 0, gz = ag.z || 0;

    const angSpeed = Math.max(Math.abs(rb), Math.abs(rg), Math.abs(ra));
    const isStill = angSpeed < STILL_RATE;
    let isFlat = Math.abs(gz) >= FLAT_GZ && Math.hypot(gx, gy) <= FLAT_XY;
    if (gx === 0 && gy === 0 && gz === 0) isFlat = true; // gravity unavailable → degrade to stillness only

    // Integrate rotation (used to detect the lift); decay while still to avoid drift
    accB += rb * dt;
    accG += rg * dt;
    if (angSpeed < 6) { accB *= 0.85; accG *= 0.85; }

    if (practiceOpen) updateLive();
    if (DEBUG) updateDebug();

    // Phase 1: wait for the phone to lie face-down and still for SETTLE_MS, then arm
    if (detectMode === "waiting") {
      if (isFlat && isStill) {
        if (stillSince == null) stillSince = now;
        const held = now - stillSince;
        if (practiceOpen) setStateText("hold", held);
        if (held >= SETTLE_MS) {
          detectMode = "armed";
          resetAccum();           // start integrating the lift from zero
          stillSince = null;
          if (practiceOpen) setStateText("ready");
        }
      } else {
        stillSince = null;
        if (practiceOpen) setStateText("place");
      }
      return;
    }

    // Phase 2: armed — the first decisive lift direction picks the number
    if (detectMode !== "armed" || locked) return;
    const aB = Math.abs(accB), aG = Math.abs(accG);
    if (Math.max(aB, aG) >= config.threshold) {
      const bucket = aB >= aG ? ("beta" + (accB > 0 ? "+" : "-"))
                              : ("gamma" + (accG > 0 ? "+" : "-"));
      lastBucket = bucket;
      fire(bucket, config.mapping[bucket]);
    }
  }

  function fire(bucket, number) {
    locked = true;
    if (isPractice) {
      showPracticeResult(bucket, number);
      setStateText("detected", number);
      // reset for another rehearsal rep
      setTimeout(() => { if (practiceOpen) beginWaiting(true); }, 1300);
    } else {
      reveal(number);
      detectMode = "idle";
    }
  }

  // ===== Reveal (draw) =====
  function reveal(number) {
    setDigit(revealPath, revealG, number);
    animateDraw(revealPath, penTip, 760);
  }

  // ===== Practice mode =====
  function openPractice() {
    practiceOpen = true;
    syncPracticeUI();
    beginWaiting(true);
    $("practice-panel").classList.add("active");
  }
  function closePractice() {
    practiceOpen = false;
    isPractice = false;
    detectMode = "idle";
    $("practice-panel").classList.remove("active");
  }
  function syncPracticeUI() {
    document.querySelectorAll("#map-grid select").forEach((sel) => {
      const bucket = sel.getAttribute("data-bucket");
      sel.innerHTML = "";
      [1, 2, 3, 4].forEach((n) => {
        const opt = document.createElement("option");
        opt.value = String(n);
        opt.textContent = String(n);
        if (config.mapping[bucket] === n) opt.selected = true;
        sel.appendChild(opt);
      });
    });
    $("threshold").value = config.threshold;
    $("threshold-val").textContent = config.threshold;
  }
  function updateLive() {
    $("live-beta").textContent = Math.round(accB);
    $("live-gamma").textContent = Math.round(accG);
    const aB = Math.abs(accB), aG = Math.abs(accG);
    let predicted = "—";
    if (Math.max(aB, aG) > 6) {
      predicted = aB >= aG ? ("beta" + (accB > 0 ? "+" : "-"))
                           : ("gamma" + (accG > 0 ? "+" : "-"));
    }
    $("live-bucket").textContent = predicted;
  }
  function showPracticeResult(bucket, number) {
    $("live-num").textContent = number;
    $("live-bucket").textContent = bucket;
  }
  function setStateText(kind, val) {
    const el = $("live-state");
    if (!el) return;
    el.classList.remove("ready");
    if (kind === "place") {
      el.textContent = "Lay the phone face-down and hold still…";
    } else if (kind === "hold") {
      el.textContent = "Holding still… " + (val / 1000).toFixed(1) + "s / 2.0s";
    } else if (kind === "ready") {
      el.textContent = "Armed — lift from one edge!";
      el.classList.add("ready");
    } else if (kind === "detected") {
      el.textContent = "Detected: " + val + "  (resetting…)";
    }
  }

  // ===== Debug mode (desktop) =====
  function updateDebug() {
    if (!debugBox) return;
    debugBox.hidden = false;
    debugBox.textContent =
      "accβ=" + accB.toFixed(0) + "  accγ=" + accG.toFixed(0) +
      "\nmode=" + detectMode + "  practice=" + isPractice + "  locked=" + locked +
      "\nthreshold=" + config.threshold + "  lastBucket=" + lastBucket +
      "\nmap " + JSON.stringify(config.mapping);
  }
  function debugFakeCapture() {
    photo.width = 375; photo.height = 812;
    const ctx = photo.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 812);
    g.addColorStop(0, "#3a7bd5"); g.addColorStop(1, "#3a6073");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 375, 812);
    clearDraw(revealPath, penTip);
    beginWaiting(false);
    show("capture");
  }
  function simulateBucket(bucket) {
    lastBucket = bucket;
    const number = config.mapping[bucket];
    if (detectMode === "waiting" || detectMode === "armed" || isPractice) {
      detectMode = "armed"; // pretend the settle completed
      locked = false;
      fire(bucket, number);
    }
    if (DEBUG) updateDebug();
  }

  // ===== Wake Lock =====
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && screens.camera.classList.contains("active")) {
      requestWakeLock();
    }
  });

  // ===== Secret gesture (long press) to open Practice Mode =====
  function bindSecret(el) {
    if (!el) return;
    let timer = null;
    const startPress = () => { timer = setTimeout(() => { openPractice(); }, 700); };
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    el.addEventListener("pointerdown", startPress);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);
  }

  // ===== Wire up events =====
  function bindEvents() {
    $("start-btn").addEventListener("click", startApp);
    screens.start.addEventListener("click", (e) => {
      if (e.target.id === "start-btn") return;
      startApp();
    });

    $("capture-btn").addEventListener("click", capturePhoto);
    $("flip-cam-btn").addEventListener("click", flipCamera);
    $("close-capture").addEventListener("click", closeCapture);

    bindSecret($("secret-hotspot"));
    bindSecret($("secret-hotspot-2"));

    $("practice-close").addEventListener("click", closePractice);
    document.querySelectorAll("#map-grid select").forEach((sel) => {
      sel.addEventListener("change", () => {
        config.mapping[sel.getAttribute("data-bucket")] = parseInt(sel.value, 10);
        saveConfig();
      });
    });
    $("threshold").addEventListener("input", () => {
      config.threshold = parseInt($("threshold").value, 10);
      $("threshold-val").textContent = config.threshold;
      saveConfig();
    });
    $("reset-defaults").addEventListener("click", () => {
      config = JSON.parse(JSON.stringify(DEFAULTS));
      saveConfig();
      syncPracticeUI();
    });

    if (DEBUG) {
      window.addEventListener("keydown", (e) => {
        const k = e.key;
        if (k === "ArrowUp") simulateBucket("beta+");
        else if (k === "ArrowDown") simulateBucket("beta-");
        else if (k === "ArrowRight") simulateBucket("gamma+");
        else if (k === "ArrowLeft") simulateBucket("gamma-");
        else if (k >= "1" && k <= "4") { detectMode = "idle"; locked = true; reveal(parseInt(k, 10)); }
        else if (k === "c" || k === "C") { video.videoWidth ? capturePhoto() : debugFakeCapture(); }
        else if (k === "x" || k === "X") closeCapture();
        else if (k === "p" || k === "P") { practiceOpen ? closePractice() : openPractice(); }
      });
      attachMotionListeners(); // allow synthetic devicemotion events during desktop testing
      updateDebug();
    }
  }

  // ===== Register service worker =====
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  bindEvents();
})();
