# FullSnap — Full Page Screenshot Chrome Extension

FullSnap is a Chrome Extension (Manifest V3) that captures **pixel-accurate, full-page screenshots** and saves them as **lossless PNG** files.

It works by scrolling through the page, capturing viewport-sized tiles, stitching them together on a canvas, and downloading the final image automatically.

## Features

- One-click full-page capture from the popup UI.
- Lossless PNG output (`chrome.tabs.captureVisibleTab` with PNG format).
- Progress updates during capture (tile count + rough ETA).
- Automatic filename with timestamp (for example: `fullsnap_20260423_131530.png`).
- Capture statistics in popup after completion (width, height, output size).

## How it works (high level)

1. Popup sends a `captureFullPage` message to the background service worker.
2. Background script injects the content script and reads page dimensions.
3. It scrolls across the page in slightly-overlapping tiles (98% viewport step).
4. Each viewport is captured as PNG.
5. Content script stitches all tiles into one canvas.
6. The final PNG is downloaded via the Downloads API.
7. Original page scroll position is restored.

## Project structure

- `manifest.json` — extension metadata, permissions, action popup, service worker.
- `popup.html` / `popup.js` — popup UI + capture trigger + status/progress rendering.
- `background.js` — orchestration (inject, measure, scroll, capture, stitch call, download).
- `content.js` — page helpers for dimensions, scrolling, restoring, and tile stitching.
- `icons/` — extension icons.

## Permissions used

- `activeTab` — run capture flow on the currently active tab.
- `scripting` — inject and execute scripts in the target tab.
- `tabs` — query active tab info and capture visible tab.
- `downloads` — save stitched PNG to disk.
- `host_permissions: <all_urls>` — allow operation on pages you capture.

## Install locally (developer mode)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.
6. Pin **FullSnap** and click the extension icon on a page.

## Usage

1. Open the webpage you want to capture.
2. Click the FullSnap extension icon.
3. Click **Capture Full Page**.
4. Wait for progress to complete.
5. Find the PNG in your default Chrome downloads folder.

## Limitations / notes

- Very large pages may exceed browser canvas limits and fail to stitch.
- Dynamic pages (sticky headers, animations, lazy loading) can introduce visual duplication or seams.
- Capture timing is intentionally throttled (~550ms between shots) to respect Chrome capture rate limits.
- Chrome Web Store packaging/signing is not included in this repository.

## Development

This project is plain JavaScript + HTML/CSS (no build step).

To iterate quickly:

1. Edit files.
2. Go to `chrome://extensions`.
3. Click **Reload** on FullSnap.
4. Re-open popup and test on a real webpage.

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file.
