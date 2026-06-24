/*
 * digits.js — handwritten digit paths + stroke-by-stroke draw animation.
 * Each digit is an SVG path "d" inside a ~100x160 coordinate box.
 * Drawing is done by animating stroke-dashoffset while a "pen tip" follows the path.
 */

// Handwriting-style paths (Snap-pen look). Coordinates ~0..100 wide, 0..160 tall.
const DIGIT_PATHS = {
  1: "M28,50 Q42,33 52,27 L52,142",
  2: "M22,55 Q28,26 54,30 Q84,35 70,68 Q58,95 24,140 L84,138",
  3: "M24,46 Q50,20 74,42 Q92,60 58,80 Q94,90 80,122 Q58,152 24,128",
  // Digit 4: two strokes (diagonal + crossbar, then the vertical stem)
  4: "M72,24 L26,104 L92,104 M70,52 L64,150",
};

/**
 * Place the digit path inside the group, sized and slightly tilted so it
 * looks hand-written.
 * @param {SVGPathElement} pathEl
 * @param {SVGGElement} groupEl  the <g> that holds the path and the pen tip
 */
function setDigit(pathEl, groupEl, digit) {
  const d = DIGIT_PATHS[digit];
  if (!d) return;
  pathEl.setAttribute("d", d);

  // The reveal layer viewBox is 300x460; digit local box is 100x160 (center 50,80).
  const scale = 2.1;
  // Place near center with a gentle random offset
  const centerX = 150 + (rand() - 0.5) * 38;
  const centerY = 230 + (rand() - 0.5) * 38;
  const rot = (rand() - 0.5) * 10;          // baseline tilt ±5°
  const slant = -(6 + rand() * 7);          // forward (italic-like) lean, ~ -6..-13°
  // Build around the digit's own center so rotation/skew look natural
  groupEl.setAttribute(
    "transform",
    `translate(${centerX.toFixed(1)} ${centerY.toFixed(1)}) rotate(${rot.toFixed(1)}) skewX(${slant.toFixed(1)}) scale(${scale}) translate(-50 -80)`
  );

  // Re-seed the hand-tremor filter so each reveal looks freshly written
  const noise = document.getElementById("rough-noise");
  if (noise) noise.setAttribute("seed", String(Math.floor(rand() * 1000)));
}

// Simple randomness (avoid relying on anything unavailable)
function rand() {
  return Math.random();
}

/**
 * Draw the path like a pen writing, with a pen-tip dot following along.
 * @param {SVGPathElement} pathEl
 * @param {SVGCircleElement} tipEl  pen-tip dot (may be null)
 * @param {number} duration  milliseconds
 * @param {Function} [onDone]
 */
function animateDraw(pathEl, tipEl, duration, onDone) {
  const len = pathEl.getTotalLength();
  pathEl.style.strokeDasharray = len + " " + len;
  pathEl.style.strokeDashoffset = String(len);
  // Force a reflow so the animation starts from zero
  pathEl.getBoundingClientRect();

  if (tipEl) tipEl.style.opacity = "1";

  const start = performance.now();
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function frame(now) {
    let t = Math.min(1, (now - start) / duration);
    const e = easeInOutQuad(t);
    const drawn = len * e;
    pathEl.style.strokeDashoffset = String(len - drawn);

    if (tipEl) {
      try {
        const pt = pathEl.getPointAtLength(drawn);
        tipEl.setAttribute("cx", pt.x.toFixed(2));
        tipEl.setAttribute("cy", pt.y.toFixed(2));
      } catch (e) { /* ignore */ }
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      if (tipEl) tipEl.style.opacity = "0";
      if (onDone) onDone();
    }
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
