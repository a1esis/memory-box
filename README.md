# Memory Box

A cozy, interactive 3D memory box built with plain HTML/CSS/JS and Three.js. No build step, no server — just static files.

## Files

```
index.html
style.css
script.js
README.md
```

## Run it locally

Because the page loads modules via `fetch`-like binary rules in some browsers, serve it over a local server rather than opening the file directly (double-clicking usually still works in Chrome, but a local server avoids any file:// quirks):

```
npx serve .
```
or
```
python3 -m http.server
```

Then open the printed local address in your browser.

## Deploy with GitHub Pages

1. Create a new GitHub repository (or use an existing one).
2. Copy `index.html`, `style.css`, and `script.js` into the root of the repository (or into a `/docs` folder — either works).
3. Commit and push:
   ```
   git add index.html style.css script.js
   git commit -m "Add memory box"
   git push
   ```
4. On GitHub, go to your repo's **Settings → Pages**.
5. Under **Build and deployment → Source**, choose **Deploy from a branch**.
6. Pick the branch (usually `main`) and the folder (`/root` or `/docs`, matching where you put the files).
7. Save. GitHub will give you a URL like `https://yourusername.github.io/your-repo/` — it can take a minute or two to go live.

No backend, database, or build tooling is required. Three.js and its OrbitControls addon load from public CDNs (cdnjs and jsdelivr), so there's nothing to install.

## How memories are stored

Each visitor's uploaded memories are saved locally in their own browser using IndexedDB — nothing is uploaded to a server, and nothing is shared between visitors. Clearing browser data/site data will clear the box.

## Interacting

- Click the box to open it.
- Click **+ Add Memory** to upload photos (or drag image files anywhere onto the page).
- Click and drag a memory to rearrange it inside the box.
- Click a memory (without dragging) to look at it closely; click anywhere, or the ✕, to put it back.
- Use the sound pill to mute/unmute the subtle wood and paper sounds.
- Drag to orbit slightly and scroll/pinch to zoom, within a limited range that keeps the box centered.
