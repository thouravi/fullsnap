// background.js — FullSnap Service Worker
// Orchestrates full-page screenshot: inject content script → scroll+capture → stitch → download

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'captureFullPage') {
    captureFullPage(msg.tabId).then(sendResponse).catch(err => {
      sendResponse({ error: err.message || String(err) });
    });
    return true; // async
  }
});

async function sendProgress(pct, label) {
  // Broadcast to all extension pages (popup)
  try {
    await chrome.runtime.sendMessage({ type: 'progress', pct, label });
  } catch (_) { /* popup may have closed */ }
}

async function captureFullPage(tabId) {
  await sendProgress(8, 'Injecting capture script…');

  // Inject content script to measure page & control scrolling
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });

  await sendProgress(12, 'Reading page dimensions…');

  // Get page dimensions from content script
  const [{ result: dims }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__fullsnap_getDimensions()
  });

  const { totalWidth, totalHeight, viewportWidth, viewportHeight, devicePixelRatio } = dims;
  const dpr = devicePixelRatio || 1;

  await sendProgress(18, `Page is ${totalWidth}×${totalHeight}px — starting tiles…`);

  // Calculate scroll steps
  // We scroll in viewport-sized steps with slight overlap to avoid seams
  const stepY = Math.floor(viewportHeight * 0.98);
  const stepX = Math.floor(viewportWidth  * 0.98);

  const cols = Math.ceil(totalWidth  / stepX);
  const rows = Math.ceil(totalHeight / stepY);
  const totalTiles = cols * rows;

  const tiles = []; // { x, y, dataUrl }
  let tileIdx = 0;

  for (let row = 0; row < rows; row++) {
    const scrollY = Math.min(row * stepY, Math.max(0, totalHeight - viewportHeight));
    const actualY = row === rows - 1 ? Math.max(0, totalHeight - viewportHeight) : row * stepY;

    for (let col = 0; col < cols; col++) {
      const actualX = col === cols - 1 ? Math.max(0, totalWidth - viewportWidth) : col * stepX;

      // Scroll to position
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (x, y) => window.__fullsnap_scrollTo(x, y),
        args: [actualX, actualY]
      });

      // Wait for scroll + render to settle before capturing.
      // Chrome enforces MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND (~2/s),
      // so we must wait at least 500ms between calls.
      await sleep(550);

      // Capture visible tab (lossless PNG)
      const dataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: 'png'  // PNG = lossless, no quality loss
      });

      tiles.push({ x: actualX, y: actualY, dataUrl });
      tileIdx++;

      const pct = 18 + Math.round((tileIdx / totalTiles) * 65);
      const remaining = totalTiles - tileIdx;
      const etaSec = Math.ceil(remaining * 0.55);
      const label = remaining > 0
        ? `Tile ${tileIdx}/${totalTiles} · ~${etaSec}s left…`
        : `Tile ${tileIdx}/${totalTiles} · almost done…`;
      await sendProgress(pct, label);
    }
  }

  await sendProgress(85, 'Stitching tiles…');

  // Restore scroll position
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__fullsnap_restore()
  });

  // Stitch tiles in an offscreen canvas via content script
  const [{ result: stitchResult }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (tiles, totalWidth, totalHeight, dpr) => {
      return await window.__fullsnap_stitch(tiles, totalWidth, totalHeight, dpr);
    },
    args: [tiles, totalWidth, totalHeight, dpr]
  });

  if (stitchResult.error) throw new Error(stitchResult.error);

  await sendProgress(95, 'Downloading…');

  // Generate filename with timestamp
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  // Download
  await chrome.downloads.download({
    url: stitchResult.dataUrl,
    filename: `fullsnap_${stamp}.png`,
    saveAs: false
  });

  await sendProgress(100, 'Done!');

  return {
    width:  totalWidth,
    height: totalHeight,
    size:   stitchResult.size
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
