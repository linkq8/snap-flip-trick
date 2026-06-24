# Snap Flip — an iPhone magic trick 🎩📸

A web app (PWA) that mimics a Snapchat camera and uses the **gyroscope** to reveal a number
the audience chose (1–4), drawn in **yellow handwriting** over the captured photo — as if the
magician wrote it with the Snapchat pen.

> ⚠️ **Not affiliated with Snap Inc.** This is a personal magic-trick / entertainment prop that
> imitates the look and feel of a camera app. It uses a generic ghost silhouette (not Snap's logo).

---

## How the trick works (the secret) 🔑
1. Take a "photo" (capture).
2. Lay the phone **face-down** (screen against the table) and hold it **still for 2 seconds** —
   detection arms silently (nothing visible, since the screen is down).
3. The audience says a number from **1 to 4** out loud.
4. Lift the phone up **from the matching edge** — the edge you raise turns the screen back toward you
   and selects the number, which is already drawn by the time you see the screen.

### Default map (lift edge → number)
| Lift the phone up from… | Number |
|-------------------------|--------|
| the **top** edge | 1 |
| the **bottom** edge | 2 |
| the **right** edge | 4 |
| the **left** edge | 3 |

> Gyroscope axes can differ slightly between devices. **Use Practice Mode** to confirm which edge
> maps to which number on your phone, and remap if needed.

---

## Practice Mode (secret) 🛠️
- Open it with a **long press (~1s)** on the **bottom-left corner** of the screen (on the camera
  screen or after a capture).
- A live state line walks you through it: *Lay face-down & still → Holding… 2.0s → Armed, lift! →
  Detected: N*. Rehearse the real motion: lay it flat, wait for "Armed", then lift from an edge.
- Shows live: the β/γ rotation values, which edge was detected, and the resulting number.
- Remap any edge from the dropdowns; reassign as needed for your device.
- Adjust **Speed (threshold)**: lower = the number appears almost instantly with a small lift,
  higher = needs a more decisive lift. Default is **20°** for a near-instant reveal.

---

## Run & host 🌐
On iOS the camera and gyroscope require an **HTTPS** origin (opening the file directly won't work).

This project is published with **GitHub Pages** — see the live link at the top of the repo. To host
your own copy:

1. Create a GitHub repo and upload all files in this folder.
2. Settings → Pages → select branch `main`, folder `/ (root)` → Save.
3. Open `https://<username>.github.io/<repo>/` on your iPhone in Safari.
4. Share → **"Add to Home Screen"** so it runs fullscreen (hides the browser bar).
5. Open it from the icon, tap "Tap to start", and allow Camera and Motion.

### Alternatives
- **Netlify / Cloudflare Pages**: drag-and-drop the folder (automatic HTTPS).
- A temporary HTTPS tunnel for quick testing from your machine.

---

## Local testing on a computer 💻
The gyroscope doesn't work on a computer, but you can test the UI and logic:

```bash
cd "iphone flip trick"
python3 -m http.server 8000
```
Then open: `http://localhost:8000/?debug=1`

**Debug-mode shortcuts:**
- `C` capture · `X` close · `P` toggle Practice Mode
- Arrow keys simulate flip directions: `↑`=forward · `↓`=back · `→`=right · `←`=left
- `1`–`4` draw that number directly (to test the drawing)
- A green box at the bottom shows the rotation values and state.

> The camera works on `localhost` in Chrome/Safari without HTTPS.

---

## Performance guide 🎭
- Memorize the lift-edge map and rehearse in Practice Mode until it's automatic.
- Take the photo, set the phone face-down on the table, and let it rest (~2s) while you talk to the
  audience and they name their number.
- Lift the phone up from the matching edge in one natural motion — the number is already written by
  the time the screen faces you.
- You can re-capture (✕ button) and repeat with any other number.
- The 2-second rest also makes it look fair: the phone is clearly sitting untouched before the
  reveal.

---

## Files
| File | Purpose |
|------|---------|
| `index.html` | The three screens + reveal layer + Practice panel |
| `styles.css` | Snapchat-like look (Avenir Next typeface) |
| `digits.js` | Handwritten digit paths 1–4 + draw animation |
| `app.js` | Camera, capture, gyroscope detection, practice, debug |
| `manifest.json`, `sw.js` | PWA config and offline support |
| `icons/` | App icon |

## Notes
- The UI **imitates** a camera app's look and feel; it is not an official client and uses no
  protected logos.
- Default camera is the back camera; the 🔄 button switches to the front.
- Typography uses **Avenir Next**, which is native on iOS (the same family Snapchat uses), with
  fallbacks on other platforms.
