/*
 * cards.js — render a clean SVG playing card, and small helpers.
 * 13 ranks × 4 suits. The reveal "develops" the chosen card onto the photo.
 */

const SUITS = {
  S: { sym: "♠", color: "#1a1a1a", name: "Spades" },
  H: { sym: "♥", color: "#d4001f", name: "Hearts" },
  D: { sym: "♦", color: "#d4001f", name: "Diamonds" },
  C: { sym: "♣", color: "#1a1a1a", name: "Clubs" },
};
const SUIT_ORDER = ["S", "H", "D", "C"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Short label the magician reads, e.g. "Q♥"
function cardLabel(rankIdx, suitKey) { return RANKS[rankIdx] + SUITS[suitKey].sym; }

// Pip layouts for number cards (column,row positions in a 2.. grid). Face/ace use a big center symbol.
const PIPS = {
  2: [[1, 0], [1, 4]],
  3: [[1, 0], [1, 2], [1, 4]],
  4: [[0, 0], [2, 0], [0, 4], [2, 4]],
  5: [[0, 0], [2, 0], [1, 2], [0, 4], [2, 4]],
  6: [[0, 0], [2, 0], [0, 2], [2, 2], [0, 4], [2, 4]],
  7: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [0, 4], [2, 4]],
  8: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [1, 3], [0, 4], [2, 4]],
  9: [[0, 0], [2, 0], [0, 1.5], [2, 1.5], [1, 2], [0, 2.5], [2, 2.5], [0, 4], [2, 4]],
  10: [[0, 0], [2, 0], [1, 0.7], [0, 1.5], [2, 1.5], [0, 2.5], [2, 2.5], [1, 3.3], [0, 4], [2, 4]],
};

// Build the SVG markup for a card face. viewBox 0 0 240 336.
function cardSVG(rankIdx, suitKey) {
  const r = RANKS[rankIdx], s = SUITS[suitKey], sym = s.sym, col = s.color;
  const idx = (x, y, anchor, rot) =>
    '<g transform="translate(' + x + ',' + y + ')' + (rot ? ' rotate(180)' : '') + '">' +
    '<text class="cr-rank" text-anchor="' + anchor + '" fill="' + col + '">' + r + '</text>' +
    '<text class="cr-suit-sm" text-anchor="' + anchor + '" fill="' + col + '" dy="26">' + sym + '</text></g>';

  let center = "";
  const n = parseInt(r, 10);
  if (PIPS[n]) {
    // number card: lay pips in 3 columns × 5 rows grid inside the face
    const xs = [78, 120, 162], ys = [92, 130, 168, 206, 244];
    center = PIPS[n].map(function (p) {
      const cx = xs[p[0]], cy = ys[0] + (p[1] / 4) * (ys[4] - ys[0]);
      const flip = p[1] > 2 ? " rotate(180 " + cx + " " + cy + ")" : "";
      return '<text class="cr-pip" x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" fill="' + col + '"' +
        (flip ? ' transform="' + flip.trim() + '"' : "") + '>' + sym + "</text>";
    }).join("");
  } else if (r === "A") {
    // Ace → one large centre suit
    center = '<text class="cr-center-ace" x="120" y="218" text-anchor="middle" fill="' + col + '">' + sym + "</text>";
  } else {
    // J, Q, K → one large centre letter with a small suit beneath (no overlap)
    center =
      '<text class="cr-center-letter" x="120" y="196" text-anchor="middle" fill="' + col + '">' + r + "</text>" +
      '<text class="cr-center-court-suit" x="120" y="246" text-anchor="middle" fill="' + col + '">' + sym + "</text>";
  }

  return (
    '<svg viewBox="0 0 240 336" xmlns="http://www.w3.org/2000/svg" class="card-face">' +
    '<rect x="2" y="2" width="236" height="332" rx="18" fill="#fdfdfb" stroke="#e3e3da" stroke-width="2"/>' +
    idx(22, 40, "start", false) +
    idx(218, 296, "start", true) +
    center +
    "</svg>"
  );
}
