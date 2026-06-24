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

  // The reveal layer viewBox is 300x460. Place the digit near center, large, with a small random tilt.
  const scale = 2.0;
  const w = 100 * scale, h = 160 * scale;
  // Gentle random offset around the middle
  const jitterX = (rand() - 0.5) * 40;
  const jitterY = (rand() - 0.5) * 40;
  const x = (300 - w) / 2 + jitterX;
  const y = (460 - h) / 2 + jitterY;
  const rot = (rand() - 0.5) * 16; // tilt ±8 degrees
  groupEl.setAttribute(
    "transform",
    `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)} ${(w/2).toFixed(1)} ${(h/2).toFixed(1)}) scale(${scale})`
  );
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
