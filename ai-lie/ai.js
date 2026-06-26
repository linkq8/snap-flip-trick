/*
 * ai.js — REAL on-device face analysis (MediaPipe FaceLandmarker, 468 points).
 * Draws a live green mesh over the face. This part is genuinely AI and is what
 * sells the illusion. If the model can't load (offline / old device), it falls
 * back to a synthetic scan grid so the performance still looks high-tech.
 *
 * window.FaceAI.start(video, canvas, { mirror, onStatus, onFace })
 * window.FaceAI.stop()
 */
(function () {
  "use strict";
  const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
  const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
  const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

  let landmarker = null, draw = null, V = null;
  let raf = null, running = false, mode = "none";
  let video = null, canvas = null, ctx = null, opts = {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function status(s) { if (opts.onStatus) try { opts.onStatus(s); } catch (e) {} }

  async function start(v, c, o) {
    video = v; canvas = c; opts = o || {}; ctx = canvas.getContext("2d");
    running = true;
    window.addEventListener("resize", sizeCanvas);
    sizeCanvas();
    status("initializing");
    try {
      V = await import(VISION_URL);
      const fileset = await V.FilesetResolver.forVisionTasks(WASM_URL);
      landmarker = await V.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO", numFaces: 1,
      });
      draw = new V.DrawingUtils(ctx);
      mode = "mesh"; status("ready");
    } catch (e) {
      mode = "fallback"; status("fallback");
    }
    loop();
  }

  function stop() {
    running = false; if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", sizeCanvas);
    try { if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (e) {}
  }

  // Size + position the overlay to exactly cover the video (object-fit: cover math).
  function sizeCanvas() {
    if (!canvas) return;
    const W = window.innerWidth, H = window.innerHeight;
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    const scale = Math.max(W / vw, H / vh);
    const dW = vw * scale, dH = vh * scale;
    const offX = (W - dW) / 2, offY = (H - dH) / 2;
    canvas.style.position = "absolute";
    canvas.style.left = offX + "px"; canvas.style.top = offY + "px";
    canvas.style.width = dW + "px"; canvas.style.height = dH + "px";
    canvas.style.transform = opts.mirror ? "scaleX(-1)" : "none";
    canvas.width = Math.round(dW * dpr); canvas.height = Math.round(dH * dpr);
  }

  let t0 = 0;
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (mode === "mesh") drawMesh();
    else if (mode === "fallback") drawFallback();
  }

  function drawMesh() {
    if (!video.videoWidth) return;
    let res;
    try { res = landmarker.detectForVideo(video, performance.now()); } catch (e) { return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const faces = (res && res.faceLandmarks) || [];
    if (opts.onFace) try { opts.onFace(faces.length > 0); } catch (e) {}
    const F = V.FaceLandmarker, lw = dpr;
    for (const lm of faces) {
      draw.drawConnectors(lm, F.FACE_LANDMARKS_TESSELATION, { color: "rgba(43,255,154,0.28)", lineWidth: lw * 0.5 });
      draw.drawConnectors(lm, F.FACE_LANDMARKS_FACE_OVAL, { color: "rgba(43,255,154,0.95)", lineWidth: lw * 1.4 });
      draw.drawConnectors(lm, F.FACE_LANDMARKS_LEFT_EYE, { color: "#2bff9a", lineWidth: lw });
      draw.drawConnectors(lm, F.FACE_LANDMARKS_RIGHT_EYE, { color: "#2bff9a", lineWidth: lw });
      draw.drawConnectors(lm, F.FACE_LANDMARKS_LIPS, { color: "#2bff9a", lineWidth: lw });
      // glowing landmark dots
      ctx.fillStyle = "rgba(43,255,154,0.9)";
      for (let i = 0; i < lm.length; i += 4) {
        ctx.beginPath(); ctx.arc(lm[i].x * canvas.width, lm[i].y * canvas.height, lw * 0.8, 0, 6.283); ctx.fill();
      }
    }
  }

  // Synthetic scan grid (only if the AI model couldn't load).
  function drawFallback() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (opts.onFace) try { opts.onFace(true); } catch (e) {}
    t0 += 0.02;
    ctx.strokeStyle = "rgba(43,255,154,0.18)"; ctx.lineWidth = dpr * 0.5;
    const step = 46 * dpr;
    for (let x = 0; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const cx = w / 2 + Math.sin(t0) * 30 * dpr, cy = h * 0.42;
    ctx.strokeStyle = "rgba(43,255,154,0.8)"; ctx.lineWidth = dpr * 1.4;
    ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.22, h * 0.16, 0, 0, 6.283); ctx.stroke();
  }

  window.FaceAI = { start: start, stop: stop };
})();
