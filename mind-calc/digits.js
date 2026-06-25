/*
 * digits.js — human handwriting for 0–9 + stroke draw animation.
 * (Reused from the Snap Flip app and extended from 1–4 to all ten digits, plus a
 *  multi-digit setNumber() so any forced number can be revealed.)
 *
 * Each digit is a set of strokes; each stroke is a list of anchor POINTS in a
 * ~100(w) x 160(h) box. Points are jittered per draw and connected with a smooth
 * Catmull-Rom spline, so the digit looks naturally hand-written and never identical.
 */

const DIGIT_POINTS = {
  0: [
    [[50, 32], [72, 50], [79, 90], [67, 136], [45, 149], [23, 127], [18, 86], [29, 47], [50, 32]],
  ],
  1: [
    [[31, 61], [42, 45], [53, 30], [54, 50], [52, 102], [50, 150]],
    [[27, 151], [45, 147], [64, 152]],
  ],
  2: [
    [[23, 55], [33, 31], [55, 28], [71, 44], [65, 68], [45, 100], [27, 135], [54, 132], [87, 128]],
  ],
  3: [
    [[26, 49], [45, 26], [69, 36], [75, 57], [55, 76], [80, 84], [84, 111], [62, 151], [27, 127]],
  ],
  4: [
    [[61, 51], [40, 83], [23, 107], [60, 103], [98, 99]],
    [[68, 27], [70, 90], [71, 153]],
  ],
  5: [
    [[72, 30], [37, 31], [31, 74], [56, 65], [79, 82], [80, 116], [52, 151], [24, 137]],
  ],
  6: [
    [[66, 31], [41, 44], [25, 80], [23, 113], [40, 148], [66, 143], [79, 113], [60, 92], [32, 101]],
  ],
  7: [
    [[23, 33], [82, 29], [67, 71], [50, 110], [40, 152]],
    [[40, 92], [66, 88]],
  ],
  8: [
    [[52, 31], [30, 46], [36, 74], [55, 85], [73, 97], [74, 129], [50, 151], [26, 131], [30, 99], [49, 84], [64, 71], [63, 45], [52, 31]],
  ],
  9: [
    [[65, 99], [37, 92], [24, 64], [41, 40], [66, 36], [80, 65], [78, 105], [66, 139], [44, 151]],
  ],
};

const JITTER = 3.4; // per-point random offset → human variation each draw

function rand() { return Math.random(); }
function f(n) { return n.toFixed(1); }

// Smooth interpolating spline (Catmull-Rom → cubic Bézier) through the given points.
function smoothPath(pts) {
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    return "M" + f(pts[0][0]) + "," + f(pts[0][1]) + " L" + f(pts[1][0]) + "," + f(pts[1][1]);
  }
  let d = "M" + f(pts[0][0]) + "," + f(pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += " C" + f(c1x) + "," + f(c1y) + " " + f(c2x) + "," + f(c2y) + " " + f(p2[0]) + "," + f(p2[1]);
  }
  return d;
}

// Build one digit's path data (fresh jitter each call), optional x-offset for multi-digit.
function buildDigitPath(digit, dx) {
  const strokes = DIGIT_POINTS[digit];
  if (!strokes) return "";
  const ox = dx || 0;
  return strokes.map(function (stroke) {
    const jittered = stroke.map(function (p) {
      return [p[0] + ox + (rand() - 0.5) * JITTER, p[1] + (rand() - 0.5) * JITTER];
    });
    return smoothPath(jittered);
  }).join(" ");
}

/** Place a single freshly-built digit centered in the group with a natural slant. */
function setDigit(pathEl, groupEl, digit, opts) {
  setNumber(pathEl, groupEl, String(digit), opts);
}

/**
 * Render a whole NUMBER (1+ digits) as handwriting, centered in the reveal layer.
 * Reveal viewBox is assumed ~320x360 (center 160,180); per-digit box is 100x160.
 */
function setNumber(pathEl, groupEl, numStr, opts) {
  numStr = String(numStr);
  const o = opts || {};
  const spacing = 76;           // local px between digit origins
  const chars = numStr.split("").filter(function (c) { return /[0-9]/.test(c); });
  if (!chars.length) return;

  let combined = "";
  chars.forEach(function (ch, i) {
    combined += " " + buildDigitPath(ch, i * spacing);
  });
  pathEl.setAttribute("d", combined.trim());

  const totalW = (chars.length - 1) * spacing + 100;
  const scale = o.scale || (chars.length > 1 ? 1.5 : 1.9);
  const centerX = o.centerX || 160, centerY = o.centerY || 180;
  const rot = (rand() - 0.5) * 6;          // overall tilt ±3°
  const slant = -(4 + rand() * 6);         // forward lean ~ -4..-10°
  groupEl.setAttribute(
    "transform",
    "translate(" + centerX + " " + centerY + ") rotate(" + rot.toFixed(1) +
    ") skewX(" + slant.toFixed(1) + ") scale(" + scale + ") translate(" + (-totalW / 2).toFixed(1) + " -80)"
  );

  // Re-seed the hand-tremor filter so each reveal's edge wobble is unique too.
  const noise = document.getElementById("rough-noise");
  if (noise) noise.setAttribute("seed", String(Math.floor(rand() * 1000)));
}

/** Draw the path like a pen writing, with a pen-tip dot following along. */
function animateDraw(pathEl, tipEl, duration, onDone) {
  const len = pathEl.getTotalLength();
  pathEl.style.strokeDasharray = len + " " + len;
  pathEl.style.strokeDashoffset = String(len);
  pathEl.getBoundingClientRect(); // force reflow so it starts from zero

  if (tipEl) tipEl.style.opacity = "1";
  const start = performance.now();
  function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function frame(now) {
    let t = Math.min(1, (now - start) / duration);
    const drawn = len * easeInOutQuad(t);
    pathEl.style.strokeDashoffset = String(len - drawn);
    if (tipEl) {
      try { const pt = pathEl.getPointAtLength(drawn); tipEl.setAttribute("cx", pt.x.toFixed(2)); tipEl.setAttribute("cy", pt.y.toFixed(2)); } catch (e) {}
    }
    if (t < 1) requestAnimationFrame(frame);
    else { if (tipEl) tipEl.style.opacity = "0"; if (onDone) onDone(); }
  }
  requestAnimationFrame(frame);
}

/** Clear the current drawing. */
function clearDraw(pathEl, tipEl) {
  pathEl.removeAttribute("d");
  pathEl.style.strokeDasharray = "";
  pathEl.style.strokeDashoffset = "";
  if (tipEl) tipEl.style.opacity = "0";
}
