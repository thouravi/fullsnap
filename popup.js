// popup.js — FullSnap Extension

const captureBtn  = document.getElementById('captureBtn');
const statusEl    = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const pageTitleEl = document.getElementById('pageTitle');
const statsRow    = document.getElementById('statsRow');
const statW       = document.getElementById('statW');
const statH       = document.getElementById('statH');
const statSize    = document.getElementById('statSize');

// Load current tab info
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab) pageTitleEl.textContent = tab.title || tab.url || 'Unknown page';
});

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + type;
}

function setProgress(pct) {
  progressBar.style.width = pct + '%';
}

function formatBytes(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  captureBtn.classList.add('loading');
  captureBtn.innerHTML = '<span class="spinner"></span>Capturing...<div class="progress-bar" id="progressBar"></div>';
  statsRow.style.display = 'none';

  setStatus('Initializing capture…', 'working');
  setProgress(5);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');

    // Listen for progress messages from background
    const progressListener = (msg) => {
      if (msg.type === 'progress') {
        setProgress(msg.pct);
        setStatus(msg.label, 'working');
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);

    // Kick off capture in background
    const result = await chrome.runtime.sendMessage({
      type: 'captureFullPage',
      tabId: tab.id
    });

    chrome.runtime.onMessage.removeListener(progressListener);

    if (result.error) throw new Error(result.error);

    // Show stats
    setProgress(100);
    setStatus('✓ Screenshot saved!', 'success');

    statW.textContent    = result.width?.toLocaleString()  || '—';
    statH.textContent    = result.height?.toLocaleString() || '—';
    statSize.textContent = result.size ? formatBytes(result.size) : '—';
    statsRow.style.display = 'flex';

  } catch (err) {
    setStatus('✗ ' + (err.message || 'Capture failed'), 'error');
    setProgress(0);
    console.error('[FullSnap]', err);
  } finally {
    captureBtn.disabled = false;
    captureBtn.classList.remove('loading');
    captureBtn.innerHTML = '📸 &nbsp;Capture Full Page<div class="progress-bar" id="progressBar"></div>';
    // Let progress stay visible for a moment
    setTimeout(() => setProgress(0), 2000);
  }
});
