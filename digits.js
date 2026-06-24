/*
 * digits.js — human handwriting for 1–4 + stroke-by-stroke draw animation.
 *
 * Each digit is a set of strokes; each stroke is a list of anchor POINTS.
 * On every reveal the points are jittered slightly and connected with a smooth
 * Catmull-Rom spline, so the digit looks naturally hand-written and is never
 * identical twice (no robotic, perfectly-straight lines).
 */

// Anchor points in a ~100 (wide) x 160 (tall) box. Shaped to read like Snapchat-pen handwriting.
const DIGIT_POINTS = {
  // up-flick to the peak, long slightly-curved downstroke, then a short base serif
  1: [
    [[31, 61], [42, 45], [53, 30], [54, 50], [52, 102], [50, 150]],
    [[27, 151], [45, 147], [64, 152]],
  ],
  // round top, sweeping diagonal down to the left, flat base flicking up to the right
  2: [
    [[23, 55], [33, 31], [55, 28], [71, 44], [65, 68], [45, 100], [27, 135], [54, 132], [87, 128]],
  ],
  // pointed top, upper bowl, middle pinch, lower bowl — open on the left
  3: [
    [[26, 49], [45, 26], [69, 36], [75, 57], [55, 76], [80, 84], [84, 111], [62, 151], [27, 127]],
  ],
  // open 4: slanted stroke down-left into the crossbar, then a long vertical stem
  4: [
    [[61, 51], [40, 83], [23, 107], [60, 103], [98, 99]],
    [[68, 27], [70, 90], [71, 153]],
  ],
};

const JITTER = 3.4; // per-point random offset (in the 100-wide space) → human variation each draw

function rand() { return Math.random(); }

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
function f(n) { return n.toFixed(1); }

// Build the digit's path data with fresh jitter on each call.
function buildDigitPath(digit) {
  const strokes = DIGIT_POINTS[digit];
  if (!strokes) return "";
  return strokes.map(function (stroke) {
    const jittered = stroke.map(function (p) {
      return [p[0] + (rand() - 0.5) * JITTER, p[1] + (rand() - 0.5) * JITTER];
    });
    return smoothPath(jittered);
  }).join(" ");
}

/**
 * Place the freshly-built digit in the group, sized with a natural slant/rotation.
 */
function setDigit(pathEl, groupEl, digit) {
  const d = buildDigitPath(digit);
  if (!d) return;
  pathEl.setAttribute("d", d);

  // Reveal layer viewBox is 300x460; digit local box is 100x160 (center 50,80).
  const scale = 2.1;
  const centerX = 150 + (rand() - 0.5) * 36;
  const centerY = 230 + (rand() - 0.5) * 36;
  const rot = (rand() - 0.5) * 9;     // overall tilt ±4.5°
  const slant = -(5 + rand() * 7);    // forward (italic-like) lean ~ -5..-12°
  groupEl.setAttribute(
    "transform",
    "translate(" + centerX.toFixed(1) + " " + centerY.toFixed(1) + ") rotate(" + rot.toFixed(1) +
    ") skewX(" + slant.toFixed(1) + ") scale(" + scale + ") translate(-50 -80)"
  );

  // Re-seed the hand-tremor filter so each reveal's edge wobble is unique too.
  const noise = document.getElementById("rough-noise");
  if (noise) noise.setAttribute("seed", String(Math.floor(rand() * 1000)));
}

/**
 * Draw the path like a pen writing, with a pen-tip dot following along.
 */
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
