/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Wireless Phone Camera Setup
   ════════════════════════════════════════════════════════════ */

// ─── Clock ──────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  document.getElementById('header-date').textContent = dateStr;
  document.getElementById('header-time').textContent = timeStr;
}
updateClock();
setInterval(updateClock, 1000);

// ─── Navigation ─────────────────────────────────────────────
document.getElementById('btn-back').addEventListener('click', () => {
  // If user leaves, stop the server to free up resources unless connected
  window.api.wirelessStopServer();
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('invoiceId')) {
    window.location.href = 'customers.html';
  } else {
    window.location.href = 'camera.html';
  }
});

// ─── Setup Logic ────────────────────────────────────────────
const qrContainer = document.getElementById('qr-container');
const statusText = document.getElementById('status-text');
const urlDisplay = document.getElementById('url-display');

async function initializeServer() {
  try {
    const response = await window.api.wirelessStartServer();
    
    if (response.success) {
      const url = response.url;
      
      // Generate QR Code using a fast public API
      const cacheBustUrl = url + '?cb=' + Date.now();
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(cacheBustUrl)}`;
      
      // Update UI
      qrContainer.innerHTML = `<img src="${qrUrl}" alt="QR Code for Phone Camera">`;
      statusText.innerHTML = `<span style="color: var(--accent-cyan);">Waiting for phone connection...</span>`;
      urlDisplay.style.display = 'block';
      urlDisplay.textContent = url;
      
      const setLiveUI = () => {
        statusText.innerHTML = `<span style="color: #10b981; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 8px;"><span class="material-icons-round">check_circle</span> Phone Connected! Live</span>`;
        document.getElementById('preview-placeholder').style.display = 'none';
        document.getElementById('live-img').style.display = 'block';
        document.getElementById('btn-proceed').style.display = 'flex';
        
        window.api.onWirelessFrame((frameData) => {
          document.getElementById('live-img').src = frameData.frame;
        });
      };

      if (response.isLive) {
        setLiveUI();
      }

      // Listen for connection
      window.api.onWirelessStatus((data) => {
        if (data.status === 'LIVE') {
          setLiveUI();
        } else if (data.status === 'DISCONNECTED') {
          statusText.innerHTML = `<span style="color: var(--status-error);">Phone disconnected. Waiting...</span>`;
          document.getElementById('preview-placeholder').style.display = 'flex';
          document.getElementById('live-img').style.display = 'none';
          document.getElementById('btn-proceed').style.display = 'none';
        }
      });

      // Listen for remote record start
      window.api.onWirelessRecordTrigger && window.api.onWirelessRecordTrigger((data) => {
        if (data.action === 'start') {
          const urlParams = new URLSearchParams(window.location.search);
          const invoiceId = urlParams.get('invoiceId');
          let nextUrl = 'camera_live.html?source=wireless&autoRecord=true';
          if (invoiceId) {
            nextUrl += `&invoiceId=${invoiceId}`;
          }
          window.location.href = nextUrl;
        }
      });

      // Proceed to recording view
      document.getElementById('btn-proceed').addEventListener('click', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const invoiceId = urlParams.get('invoiceId');
        let nextUrl = 'camera_live.html?source=wireless';
        if (invoiceId) {
          nextUrl += `&invoiceId=${invoiceId}`;
        }
        window.location.href = nextUrl;
      });
      
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    statusText.innerHTML = `<span style="color: var(--status-error);">Failed to start server: ${error.message}</span>`;
    qrContainer.innerHTML = '<span class="material-icons-round" style="color: var(--status-error); font-size: 48px;">error</span>';
  }
}

// Start immediately
initializeServer();
