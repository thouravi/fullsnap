// content.js — FullSnap Content Script
// Runs in the context of the page being captured.
// Exposes helper functions on window.__fullsnap_*

(function () {
  'use strict';

  let _savedScrollX = 0;
  let _savedScrollY = 0;
  let _savedOverflow = '';

  // ── Dimensions ─────────────────────────────────────────────────────────────
  window.__fullsnap_getDimensions = function () {
    const body = document.body;
    const docEl = document.documentElement;

    // Lock scrollbars so they don't affect measurements
    _savedOverflow = document.documentElement.style.overflow;
    _savedScrollX  = window.scrollX;
    _savedScrollY  = window.scrollY;

    const totalWidth  = Math.max(
      body.scrollWidth, body.offsetWidth,
      docEl.scrollWidth, docEl.offsetWidth,
      docEl.clientWidth
    );
    const totalHeight = Math.max(
      body.scrollHeight, body.offsetHeight,
      docEl.scrollHeight, docEl.offsetHeight,
      docEl.clientHeight
    );

    return {
      totalWidth,
      totalHeight,
      viewportWidth:   window.innerWidth,
      viewportHeight:  window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  };

  // ── Scroll ──────────────────────────────────────────────────────────────────
  window.__fullsnap_scrollTo = function (x, y) {
    window.scrollTo({ left: x, top: y, behavior: 'instant' });
    // Return actual scroll (for verification)
    return { x: window.scrollX, y: window.scrollY };
  };

  // ── Restore ─────────────────────────────────────────────────────────────────
  window.__fullsnap_restore = function () {
    window.scrollTo({ left: _savedScrollX, top: _savedScrollY, behavior: 'instant' });
    document.documentElement.style.overflow = _savedOverflow;
  };

  // ── Stitch ──────────────────────────────────────────────────────────────────
  // Tiles: [{ x, y, dataUrl }]
  // Each dataUrl is a PNG of the visible viewport captured at that scroll position.
  // We paint each tile onto an offscreen canvas at position (x * dpr, y * dpr).
  window.__fullsnap_stitch = async function (tiles, totalWidth, totalHeight, dpr) {
    try {
      // Use OffscreenCanvas if available (better memory), else regular canvas
      let canvas, ctx;

      const canvasWidth  = Math.round(totalWidth  * dpr);
      const canvasHeight = Math.round(totalHeight * dpr);

      // Guard: canvas max size (browser limit ~32768px per side, 268M px total)
      const MAX_SIDE  = 32000;
      const MAX_TOTAL = 268_000_000;
      if (canvasWidth > MAX_SIDE || canvasHeight > MAX_SIDE || canvasWidth * canvasHeight > MAX_TOTAL) {
        return { error: `Page too large to stitch (${canvasWidth}×${canvasHeight}). Try scrolling less or on a shorter page.` };
      }

      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
        ctx    = canvas.getContext('2d');
      } else {
        canvas        = document.createElement('canvas');
        canvas.width  = canvasWidth;
        canvas.height = canvasHeight;
        ctx           = canvas.getContext('2d');
      }

      // Paint each tile
      for (const tile of tiles) {
        const img = await loadImage(tile.dataUrl);
        const dx = Math.round(tile.x * dpr);
        const dy = Math.round(tile.y * dpr);
        ctx.drawImage(img, dx, dy);
      }

      // Export as lossless PNG
      let blob;
      if (canvas instanceof OffscreenCanvas) {
        blob = await canvas.convertToBlob({ type: 'image/png' });
      } else {
        blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      }

      if (!blob) return { error: 'Failed to export canvas to PNG.' };

      // Convert blob → data URL
      const dataUrl = await blobToDataUrl(blob);

      return {
        dataUrl,
        size: blob.size
      };
    } catch (err) {
      return { error: String(err) };
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load tile image'));
      img.src     = src;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  }

})();
