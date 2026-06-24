/*
 * app.js — the trick's logic
 * 1) Camera & motion permissions   2) live camera   3) capture
 * 4) detect flip direction via gyroscope   5) draw the number   6) practice mode   7) debug mode
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
  const revealSvg = $("reveal");
  const revealPath = $("reveal-path");
  const revealG = $("reveal-g");
  const penTip = $("pen-tip");
  const debugBox = $("debug");

  // ===== Settings (persisted locally) =====
  const STORE_KEY = "snapflip.config.v1";
  const DEFAULTS = {
    threshold: 65, // integrated rotation (degrees) needed to lock the decision
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

  // ===== State =====
  let stream = null;
  let currentFacing = "environment";
  let armed = false;        // armed for detection after a capture (the real trick)
  let practiceLive = false; // live detection in practice mode
  let practiceOpen = false;
  let locked = false;       // locked — don't reveal twice
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
    window.addEventListener("deviceorientation", onOrient, true);
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
    // Mirror the front camera (like Snapchat)
    video.style.transform = facing === "user" ? "scaleX(-1)" : "none";
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

    // Prepare for detection
    clearDraw(revealPath, penTip);
    resetAccum();
    locked = false;
    armed = true;
    show("capture");
  }

  function closeCapture() {
    armed = false;
    locked = false;
    clearDraw(revealPath, penTip);
    show("camera");
  }

  // ===== Flip-direction detection =====
  function resetAccum() { accB = 0; accG = 0; lastNow = null; }

  function onMotion(e) {
    const now = performance.now();
    let dt = lastNow == null ? 0 : (now - lastNow) / 1000;
    lastNow = now;
    if (dt <= 0 || dt > 0.5) dt = (e.interval && e.interval > 0) ? e.interval : 0.016;

    const rr = e.rotationRate || {};
    const rb = rr.beta || 0;   // rotation around x (tilt fwd/back)
    const rg = rr.gamma || 0;  // rotation around y (tilt left/right)
    const ra = rr.alpha || 0;  // rotation around z

    accB += rb * dt;
    accG += rg * dt;

    // Decay while still, to prevent drift
    if (Math.max(Math.abs(rb), Math.abs(rg), Math.abs(ra)) < 6) {
      accB *= 0.85;
      accG *= 0.85;
    }

    if (practiceOpen) updateLive();
    if (DEBUG) updateDebug();

    if (locked) return;
    if (!(armed || practiceLive)) return;

    const aB = Math.abs(accB), aG = Math.abs(accG);
    const peak = Math.max(aB, aG);
    if (peak >= config.threshold) {
      const bucket = aB >= aG
        ? ("beta" + (accB > 0 ? "+" : "-"))
        : ("gamma" + (accG > 0 ? "+" : "-"));
      lastBucket = bucket;
      const number = config.mapping[bucket];
      fire(bucket, number);
    }
  }

  // Live orientation values (for the practice display) — a helpful reference
  let liveBeta = 0, liveGamma = 0;
  function onOrient(e) {
    if (e.beta != null) liveBeta = e.beta;
    if (e.gamma != null) liveGamma = e.gamma;
  }

  function fire(bucket, number) {
    locked = true;
    if (armed) {
      armed = false;
      reveal(number);
    } else if (practiceLive) {
      showPracticeResult(bucket, number);
      setTimeout(() => { locked = false; resetAccum(); }, 800);
    }
  }

  // ===== Reveal (draw) =====
  function reveal(number) {
    setDigit(revealPath, revealG, number);
    animateDraw(revealPath, penTip, 680);
  }

  // ===== Practice mode =====
  function openPractice() {
    practiceOpen = true;
    practiceLive = true;
    locked = false;
    resetAccum();
    syncPracticeUI();
    $("practice-panel").classList.add("active");
  }
  function closePractice() {
    practiceOpen = false;
    practiceLive = false;
    $("practice-panel").classList.remove("active");
  }
  function syncPracticeUI() {
    // Map dropdowns
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

  // ===== Debug mode (desktop) =====
  function updateDebug() {
    if (!debugBox) return;
    debugBox.hidden = false;
    debugBox.textContent =
      "accβ=" + accB.toFixed(0) + "  accγ=" + accG.toFixed(0) +
      "\nthreshold=" + config.threshold +
      "  armed=" + armed + "  locked=" + locked +
      "\nlastBucket=" + lastBucket +
      "\nmap " + JSON.stringify(config.mapping);
  }
  function simulateBucket(bucket) {
    // Simulate a flip from the keyboard for desktop testing
    lastBucket = bucket;
    const number = config.mapping[bucket];
    if (armed || practiceLive) fire(bucket, number);
    if (DEBUG) updateDebug();
  }

  // ===== Wake Lock =====
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
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
    const startPress = (ev) => {
      timer = setTimeout(() => { openPractice(); }, 700);
    };
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
      if (e.target.id === "start-btn") return; // avoid double-trigger
      startApp();
    });

    $("capture-btn").addEventListener("click", capturePhoto);
    $("flip-cam-btn").addEventListener("click", flipCamera);
    $("close-capture").addEventListener("click", closeCapture);

    bindSecret($("secret-hotspot"));
    bindSecret($("secret-hotspot-2"));

    // Practice panel
    $("practice-close").addEventListener("click", closePractice);
    document.querySelectorAll("#map-grid select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const bucket = sel.getAttribute("data-bucket");
        config.mapping[bucket] = parseInt(sel.value, 10);
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

    // Debug mode on desktop
    if (DEBUG) {
      window.addEventListener("keydown", (e) => {
        const k = e.key;
        if (k === "ArrowUp") simulateBucket("beta+");
        else if (k === "ArrowDown") simulateBucket("beta-");
        else if (k === "ArrowRight") simulateBucket("gamma+");
        else if (k === "ArrowLeft") simulateBucket("gamma-");
        else if (k >= "1" && k <= "4") { if (armed) { locked = true; armed = false; reveal(parseInt(k, 10)); } }
        else if (k === "c" || k === "C") capturePhoto();
        else if (k === "x" || k === "X") closeCapture();
        else if (k === "p" || k === "P") { practiceOpen ? closePractice() : openPractice(); }
      });
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
