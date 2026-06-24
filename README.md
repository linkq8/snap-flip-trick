# Snap Flip — an iPhone magic trick 🎩📸

A web app (PWA) that mimics a Snapchat camera and uses the **gyroscope** to reveal a number
the audience chose (1–4), drawn in **yellow handwriting** over the captured photo — as if the
magician wrote it with the Snapchat pen.

> ⚠️ **Not affiliated with Snap Inc.** This is a personal magic-trick / entertainment prop that
> imitates the look and feel of a camera app. It uses a generic ghost silhouette (not Snap's logo).

---

## How the trick works (the secret) 🔑
1. The audience says a number from **1 to 4** out loud.
2. The magician tilts/flips the phone in the **matching direction**.
3. The gyroscope detects the tilt direction and instantly draws the right number.
4. The magician lifts the phone to show the screen at a readable angle.

### Default map (direction → number)
| Direction | Number |
|-----------|--------|
| Tilt top edge **away** from you (forward) | 1 |
| Tilt top edge **toward** you (back) | 2 |
| Tilt **right** | 4 |
| Tilt **left** | 3 |

> Gyroscope axes can differ slightly between devices. **Use Practice Mode** to confirm the map on
> your phone and remap if needed.

---

## Practice Mode (secret) 🛠️
- Open it with a **long press (~1s)** on the **bottom-left corner** of the screen (on the camera
  screen or after a capture).
- Shows live: the β/γ rotation values, the detected direction, and the resulting number.
- Try each direction, watch the number, and remap from the dropdowns.
- Adjust **Sensitivity (threshold)**: lower = locks faster with a small tilt, higher = needs a
  clearer flip.
- Tip: a threshold of ~65° locks the number with a light tilt, so **you** control the final
  presentation angle for the audience.

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
- Memorize the map and rehearse in Practice Mode until the tilt is natural and unnoticeable.
- Take the photo, ask for the number, then tilt the phone in the matching direction with a casual
  "let me show you" gesture.
- Thanks to the low threshold, a small tilt is enough to lock the number — then raise the phone at
  the angle that reads correctly for the audience.
- You can re-capture (✕ button) and repeat with any other number.

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
