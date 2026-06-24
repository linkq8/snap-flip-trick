/*
 * app.js — the trick's logic (gravity-based, calibratable)
 * Flow: capture → lay the phone face-down & still ~2s (arms) → lift from one edge.
 * Which edge you lift is detected from the GRAVITY tilt direction (absolute & reliable),
 * then mapped to a number 1–4 and drawn instantly.
 *
 * Because gravity axis signs differ per device/orientation, a one-time guided
 * Calibration learns the correct edge→number mapping for THIS phone.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const screens = { start: $("start-screen"), camera: $("camera-screen"), capture: $("capture-screen") };
  const video = $("video");
  const photo = $("photo");
  const revealPath = $("reveal-path");
  const revealG = $("reveal-g");
  const penTip = $("pen-tip");
  const debugBox = $("debug");

  // ===== Settings (persisted) =====
  const STORE_KEY = "snapflip.config.v4";
  const DEFAULTS = {
    tiltDeg: 10, // lift tilt (degrees) that triggers the reveal — low = very fast
    // best-guess default; the Calibrate flow overwrites these with correct values for the device
    mapping: { "ay-": 1, "ax+": 2, "ay+": 3, "ax-": 4 },
  };
  let config = loadConfig();

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        return { tiltDeg: c.tiltDeg || DEFAULTS.tiltDeg, mapping: Object.assign({}, DEFAULTS.mapping, c.mapping || {}) };
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  function saveConfig() { try { localStorage.setItem(STORE_KEY, JSON.stringify(config)); } catch (e) {} }

  // ===== Detector tuning =====
  const SETTLE_MS = 2000;   // face-down + still time to arm (real performance)
  const CALIB_SETTLE = 700; // shorter settle during calibration for speed
  const STILL_RATE = 16;    // deg/s below which the phone counts as "still"
  const FLAT_GZ = 7.8;      // m/s² — z-gravity magnitude meaning "lying flat"
  const FLAT_XY = 4.2;      // m/s² — max in-plane gravity that still counts as flat
  const GRAV_A = 0.5;       // gravity smoothing (EMA)
  const G = 9.81;
  const DRAW_MS = 110;      // reveal draw duration — as fast as possible

  function tiltTrig() { return G * Math.sin(config.tiltDeg * Math.PI / 180); }

  // ===== State =====
  let stream = null, currentFacing = "environment";
  let detectMode = "idle"; // 'idle' | 'waiting' | 'armed'
  let isPractice = false, practiceOpen = false, locked = false;
  let stillSince = null, lastNow = null, lastBucket = "—";
  let gxf = 0, gyf = 0, gzf = 0, gravInit = false; // smoothed gravity
  let gxBase = 0, gyBase = 0;                       // gravity baseline at arm time
  let wakeLock = null;

  // Calibration
  const CALIB_STEPS = [
    { num: 1, label: "the TOP edge" },
    { num: 2, label: "the POWER BUTTON side (right)" },
    { num: 3, label: "the CHARGING PORT side (bottom)" },
    { num: 4, label: "the VOLUME BUTTONS side (left)" },
  ];
  let calibrating = false, calibStep = 0, calibMap = {};

  const DEBUG = /[?&]debug/.test(location.search);

  function show(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // ===== Start + permissions =====
  async function startApp() {
    $("start-error").hidden = true;
    await requestMotionPermission();
    attachMotionListeners();
    try { await startCamera(currentFacing); }
    catch (e) {
      const err = $("start-error");
      err.hidden = false;
      err.textContent = "Couldn't start the camera. Open the page over HTTPS and allow camera access. (" + (e && e.name ? e.name : e) + ")";
      return;
    }
    requestWakeLock();
    show("camera");
  }

  async function requestMotionPermission() {
    try {
      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        const r = await DeviceMotionEvent.requestPermission();
        if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
          try { await DeviceOrientationEvent.requestPermission(); } catch (e) {}
        }
        return r === "granted";
      }
      return true;
    } catch (e) { return false; }
  }
  function attachMotionListeners() { window.addEventListener("devicemotion", onMotion, true); }

  // ===== Camera =====
  async function startCamera(facing) {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    video.srcObject = stream;
    currentFacing = facing;
    video.style.transform = facing === "user" ? "scaleX(-1)" : "none";
    await video.play().catch(() => {});
  }
  function flipCamera() { startCamera(currentFacing === "environment" ? "user" : "environment").catch(() => {}); }

  // ===== Capture =====
  function capturePhoto() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    photo.width = vw; photo.height = vh;
    const ctx = photo.getContext("2d");
    ctx.save();
    if (currentFacing === "user") { ctx.translate(vw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, vw, vh);
    ctx.restore();
    clearDraw(revealPath, penTip);
    beginWaiting(false);
    show("capture");
  }
  function closeCapture() {
    detectMode = "idle"; locked = false; isPractice = false;
    clearDraw(revealPath, penTip);
    show("camera");
  }

  // ===== Detection (gravity tilt) =====
  function beginWaiting(practice) {
    detectMode = "waiting"; isPractice = practice; locked = false; stillSince = null;
    if (practiceOpen) setStateText("place");
  }

  function onMotion(e) {
    const now = performance.now();
    let dt = lastNow == null ? 0 : (now - lastNow) / 1000;
    lastNow = now;
    if (dt <= 0 || dt > 0.5) dt = (e.interval && e.interval > 0) ? e.interval : 0.016;

    const rr = e.rotationRate || {};
    const angSpeed = Math.max(Math.abs(rr.beta || 0), Math.abs(rr.gamma || 0), Math.abs(rr.alpha || 0));

    const ag = e.accelerationIncludingGravity || {};
    let gx = ag.x || 0, gy = ag.y || 0, gz = ag.z || 0;
    if (!gravInit) { gxf = gx; gyf = gy; gzf = gz; gravInit = true; }
    else { gxf = GRAV_A * gx + (1 - GRAV_A) * gxf; gyf = GRAV_A * gy + (1 - GRAV_A) * gyf; gzf = GRAV_A * gz + (1 - GRAV_A) * gzf; }

    const haveGrav = !(gx === 0 && gy === 0 && gz === 0);
    const isStill = angSpeed < STILL_RATE;
    const isFlat = haveGrav ? (Math.abs(gzf) >= FLAT_GZ && Math.hypot(gxf, gyf) <= FLAT_XY) : isStill;

    if (practiceOpen) updateLive();
    if (DEBUG) updateDebug();

    const settleNeeded = calibrating ? CALIB_SETTLE : SETTLE_MS;

    // Phase 1: settle face-down & still, then arm (record gravity baseline)
    if (detectMode === "waiting") {
      if (isFlat && isStill) {
        if (stillSince == null) stillSince = now;
        const held = now - stillSince;
        if (practiceOpen) setStateText("hold", held, settleNeeded);
        if (held >= settleNeeded) {
          detectMode = "armed"; gxBase = gxf; gyBase = gyf; stillSince = null;
          if (practiceOpen) setStateText("ready");
        }
      } else { stillSince = null; if (practiceOpen) setStateText("place"); }
      return;
    }

    // Phase 2: armed — the first decisive tilt direction picks the edge
    if (detectMode !== "armed" || locked) return;
    const dx = gxf - gxBase, dy = gyf - gyBase;
    if (Math.hypot(dx, dy) >= tiltTrig()) {
      const bucket = Math.abs(dx) >= Math.abs(dy) ? ("ax" + (dx > 0 ? "+" : "-")) : ("ay" + (dy > 0 ? "+" : "-"));
      lastBucket = bucket;
      fire(bucket);
    }
  }

  function fire(bucket) {
    locked = true;
    if (calibrating) { recordCalib(bucket); return; }
    const number = config.mapping[bucket];
    if (isPractice) {
      showPracticeResult(bucket, number);
      setStateText("detected", number);
      setTimeout(() => { if (practiceOpen && !calibrating) beginWaiting(true); }, 1100);
    } else {
      reveal(number);
      detectMode = "idle";
    }
  }

  // ===== Reveal =====
  function reveal(number) {
    setDigit(revealPath, revealG, number);
    animateDraw(revealPath, penTip, DRAW_MS);
  }

  // ===== Guided calibration =====
  function startCalibration() {
    calibrating = true; calibStep = 0; calibMap = {};
    $("calib-area").hidden = false;
    $("calib-btn").hidden = true;
    updateCalibUI();
    beginWaiting(false);
  }
  function cancelCalibration() {
    calibrating = false;
    $("calib-area").hidden = true;
    $("calib-btn").hidden = false;
    beginWaiting(true);
  }
  function recordCalib(bucket) {
    const step = CALIB_STEPS[calibStep];
    calibMap[bucket] = step.num;
    $("calib-instr").textContent = "✓ Got it — that edge = " + step.num;
    calibStep++;
    if (calibStep >= CALIB_STEPS.length) {
      config.mapping = Object.assign({}, DEFAULTS.mapping, calibMap);
      saveConfig();
      calibrating = false;
      $("calib-step").textContent = "Done ✓";
      $("calib-instr").textContent = "Calibrated! All four edges are set for your phone.";
      setTimeout(() => { $("calib-area").hidden = true; $("calib-btn").hidden = false; beginWaiting(true); }, 1600);
    } else {
      setTimeout(() => { updateCalibUI(); beginWaiting(false); }, 850);
    }
  }
  function updateCalibUI() {
    const step = CALIB_STEPS[calibStep];
    $("calib-step").textContent = "Step " + (calibStep + 1) + " / 4";
    $("calib-instr").textContent = "Lay face-down & still, then lift from " + step.label + " → " + step.num;
  }

  // ===== Practice mode =====
  function openPractice() {
    practiceOpen = true;
    $("calib-area").hidden = true; $("calib-btn").hidden = false;
    syncPracticeUI();
    beginWaiting(true);
    $("practice-panel").classList.add("active");
  }
  function closePractice() {
    practiceOpen = false; isPractice = false; calibrating = false; detectMode = "idle";
    $("practice-panel").classList.remove("active");
  }
  function syncPracticeUI() {
    $("threshold").value = config.tiltDeg;
    $("threshold-val").textContent = config.tiltDeg;
  }
  function updateLive() {
    const dx = gxf - gxBase, dy = gyf - gyBase;
    $("live-gx").textContent = (detectMode === "armed" ? dx : 0).toFixed(1);
    $("live-gy").textContent = (detectMode === "armed" ? dy : 0).toFixed(1);
    let predicted = "—";
    if (detectMode === "armed" && Math.hypot(dx, dy) > 1.2) {
      predicted = Math.abs(dx) >= Math.abs(dy) ? ("ax" + (dx > 0 ? "+" : "-")) : ("ay" + (dy > 0 ? "+" : "-"));
    }
    $("live-bucket").textContent = predicted;
  }
  function showPracticeResult(bucket, number) {
    $("live-num").textContent = number != null ? number : "?";
    $("live-bucket").textContent = bucket;
  }
  function setStateText(kind, val, need) {
    const el = $("live-state");
    if (!el) return;
    el.classList.remove("ready");
    if (kind === "place") el.textContent = "Lay the phone face-down and hold still…";
    else if (kind === "hold") el.textContent = "Holding still… " + (val / 1000).toFixed(1) + "s / " + (need / 1000).toFixed(1) + "s";
    else if (kind === "ready") { el.textContent = "Armed — lift from an edge!"; el.classList.add("ready"); }
    else if (kind === "detected") el.textContent = "Detected: " + (val != null ? val : "?");
  }

  // ===== Debug =====
  function updateDebug() {
    if (!debugBox) return;
    debugBox.hidden = false;
    const dx = gxf - gxBase, dy = gyf - gyBase;
    debugBox.textContent =
      "gx=" + gxf.toFixed(1) + " gy=" + gyf.toFixed(1) + " gz=" + gzf.toFixed(1) +
      "\ndx=" + dx.toFixed(1) + " dy=" + dy.toFixed(1) + " trig=" + tiltTrig().toFixed(1) +
      "\nmode=" + detectMode + " calib=" + calibrating + " locked=" + locked +
      "\nlastBucket=" + lastBucket + " map=" + JSON.stringify(config.mapping);
  }
  function debugFakeCapture() {
    photo.width = 375; photo.height = 812;
    const ctx = photo.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 375, 812);
    clearDraw(revealPath, penTip);
    beginWaiting(false);
    show("capture");
  }
  function simulateBucket(bucket) {
    lastBucket = bucket;
    detectMode = "armed"; locked = false;
    fire(bucket);
    if (DEBUG) updateDebug();
  }

  // ===== Wake Lock =====
  async function requestWakeLock() {
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && screens.camera.classList.contains("active")) requestWakeLock();
  });

  // ===== Secret long-press =====
  function bindSecret(el) {
    if (!el) return;
    let timer = null;
    el.addEventListener("pointerdown", () => { timer = setTimeout(openPractice, 700); });
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);
  }

  // ===== Events =====
  function bindEvents() {
    $("start-btn").addEventListener("click", startApp);
    screens.start.addEventListener("click", (e) => { if (e.target.id !== "start-btn") startApp(); });
    $("capture-btn").addEventListener("click", capturePhoto);
    $("flip-cam-btn").addEventListener("click", flipCamera);
    $("close-capture").addEventListener("click", closeCapture);
    bindSecret($("secret-hotspot"));
    bindSecret($("secret-hotspot-2"));

    $("practice-close").addEventListener("click", closePractice);
    $("calib-btn").addEventListener("click", startCalibration);
    $("calib-cancel").addEventListener("click", cancelCalibration);
    $("threshold").addEventListener("input", () => {
      config.tiltDeg = parseInt($("threshold").value, 10);
      $("threshold-val").textContent = config.tiltDeg;
      saveConfig();
    });
    $("reset-defaults").addEventListener("click", () => {
      config = JSON.parse(JSON.stringify(DEFAULTS)); saveConfig(); syncPracticeUI();
    });

    if (DEBUG) {
      window.addEventListener("keydown", (e) => {
        const k = e.key;
        if (k === "ArrowUp") simulateBucket("ay+");
        else if (k === "ArrowDown") simulateBucket("ay-");
        else if (k === "ArrowRight") simulateBucket("ax+");
        else if (k === "ArrowLeft") simulateBucket("ax-");
        else if (k >= "1" && k <= "4") { detectMode = "idle"; locked = true; reveal(parseInt(k, 10)); }
        else if (k === "c" || k === "C") { video.videoWidth ? capturePhoto() : debugFakeCapture(); }
        else if (k === "x" || k === "X") closeCapture();
        else if (k === "p" || k === "P") { practiceOpen ? closePractice() : openPractice(); }
      });
      attachMotionListeners();
      updateDebug();
    }
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }

  bindEvents();
})();
