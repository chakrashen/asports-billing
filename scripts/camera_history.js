/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Recording History Logic
   ════════════════════════════════════════════════════════════ */

// ─── State ──────────────────────────────────────────────────
let allRecordings = [];
let deleteTargetId = null;

// ─── DOM Elements ───────────────────────────────────────────
const recList = document.getElementById('rec-list');
const recEmpty = document.getElementById('rec-empty');
const recCount = document.getElementById('rec-count');
const recFilter = document.getElementById('rec-filter');
const playerOverlay = document.getElementById('player-overlay');
const playerVideo = document.getElementById('player-video');
const playerTitle = document.getElementById('player-title');
const playerDetails = document.getElementById('player-details');
const confirmOverlay = document.getElementById('confirm-overlay');

// ─── Clock ──────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
  const dateEl = document.getElementById('header-date');
  const timeEl = document.getElementById('header-time');
  if (dateEl) dateEl.textContent = dateStr;
  if (timeEl) timeEl.textContent = timeStr;
}
updateClock();
setInterval(updateClock, 1000);

// ─── Utilities ──────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, isError = false) {
  const toast = document.getElementById('cam-toast');
  const icon = document.getElementById('toast-icon');
  const text = document.getElementById('toast-text');
  toast.className = 'cam-toast' + (isError ? ' cam-toast--error' : ' cam-toast--success');
  icon.textContent = isError ? 'error' : 'check_circle';
  text.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// ─── Load Recordings ────────────────────────────────────────
async function loadRecordings() {
  try {
    const result = await window.api.recordingGetAll();
    if (!result.success) {
      showToast('Failed to load recordings: ' + result.error, true);
      return;
    }
    allRecordings = result.recordings;
    renderRecordings();
  } catch (err) {
    console.error('Error loading recordings:', err);
    showToast('Error loading recordings', true);
  }
}

// ─── Render Recordings ──────────────────────────────────────
function renderRecordings() {
  const filter = recFilter.value;
  const filtered = filter === 'all'
    ? allRecordings
    : allRecordings.filter(r => r.source_type === filter);

  recCount.textContent = `${filtered.length} recording${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    recList.innerHTML = '';
    recEmpty.style.display = '';
    return;
  }

  recEmpty.style.display = 'none';

  recList.innerHTML = filtered.map((rec, idx) => {
    const isWebcam = rec.source_type === 'WEBCAM';
    const sourceClass = isWebcam ? 'webcam' : 'cctv';
    const sourceLabel = isWebcam ? 'Webcam' : 'CCTV';
    const iconName = isWebcam ? 'photo_camera' : 'linked_camera';

    return `
      <div class="rec-item" style="animation-delay: ${idx * 0.05}s;" data-id="${rec.id}">
        <div class="rec-item__thumb rec-item__thumb--${sourceClass}">
          <span class="material-icons-round">${iconName}</span>
        </div>
        <div class="rec-item__info">
          <div class="rec-item__name">${escapeHtml(rec.camera_name)}</div>
          <div class="rec-item__meta">
            <span class="rec-item__source-badge rec-item__source-badge--${sourceClass}">${sourceLabel}</span>
            <span class="rec-item__meta-tag">
              <span class="material-icons-round">calendar_today</span>
              ${formatDate(rec.start_time)}
            </span>
            <span class="rec-item__meta-tag">
              <span class="material-icons-round">schedule</span>
              ${formatTime(rec.start_time)}
            </span>
            <span class="rec-item__meta-tag">
              <span class="material-icons-round">timer</span>
              ${formatDuration(rec.duration_seconds)}
            </span>
            <span class="rec-item__meta-tag">
              <span class="material-icons-round">storage</span>
              ${formatFileSize(rec.file_size)}
            </span>
          </div>
        </div>
        <div class="rec-item__actions">
          <button class="rec-action-btn rec-action-btn--play" title="Play" onclick="event.stopPropagation(); playRecording(${rec.id})">
            <span class="material-icons-round">play_arrow</span>
          </button>
          <button class="rec-action-btn rec-action-btn--delete" title="Delete" onclick="event.stopPropagation(); confirmDelete(${rec.id}, '${escapeHtml(rec.camera_name)}')">
            <span class="material-icons-round">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Make rows clickable to play
  recList.querySelectorAll('.rec-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.id);
      playRecording(id);
    });
  });
}

// ─── Play Recording ─────────────────────────────────────────
async function playRecording(recordingId) {
  try {
    const detailResult = await window.api.recordingGetDetails(recordingId);
    if (!detailResult.success) {
      showToast('Failed to load recording details: ' + detailResult.error, true);
      return;
    }

    const rec = detailResult.recording;

    if (!rec.fileExists) {
      showToast('Recording file not found. It may have been moved or deleted.', true);
      return;
    }

    // Read the file
    const fileResult = await window.api.recordingReadFile(rec.file_path);
    if (!fileResult.success) {
      showToast('Failed to read recording file: ' + fileResult.error, true);
      return;
    }

    // Set video source
    const blob = new Blob(
      [Uint8Array.from(atob(fileResult.data), c => c.charCodeAt(0))],
      { type: fileResult.mime }
    );
    const url = URL.createObjectURL(blob);
    playerVideo.src = url;

    playerTitle.textContent = rec.camera_name;

    // Render details
    const isWebcam = rec.source_type === 'WEBCAM';
    playerDetails.innerHTML = `
      <div class="player-modal__detail">
        <span class="player-modal__detail-label">Source</span>
        <span class="player-modal__detail-value">${isWebcam ? 'Webcam' : 'CCTV'}</span>
      </div>
      <div class="player-modal__detail">
        <span class="player-modal__detail-label">Camera</span>
        <span class="player-modal__detail-value">${escapeHtml(rec.camera_name)}</span>
      </div>
      <div class="player-modal__detail">
        <span class="player-modal__detail-label">Date</span>
        <span class="player-modal__detail-value">${formatDate(rec.start_time)}</span>
      </div>
      <div class="player-modal__detail">
        <span class="player-modal__detail-label">Start Time</span>
        <span class="player-modal__detail-value">${formatTime(rec.start_time)}</span>
      </div>
      <div class="player-modal__detail">
        <span class="player-modal__detail-label">Duration</span>
        <span class="player-modal__detail-value">${formatDuration(rec.duration_seconds)}</span>
      </div>
      <div class="player-modal__detail">
        <span class="player-modal__detail-label">File Size</span>
        <span class="player-modal__detail-value">${formatFileSize(rec.file_size)}</span>
      </div>
      <div class="player-modal__detail">
        <span class="player-modal__detail-label">Status</span>
        <span class="player-modal__detail-value">${rec.status}</span>
      </div>
    `;

    playerOverlay.classList.add('show');

    // Cleanup blob URL when video is done or modal closes
    playerVideo.onended = () => URL.revokeObjectURL(url);

  } catch (err) {
    console.error('Error playing recording:', err);
    showToast('Error playing recording', true);
  }
}

// ─── Close Player ───────────────────────────────────────────
function closePlayer() {
  playerVideo.pause();
  if (playerVideo.src) {
    const url = playerVideo.src;
    playerVideo.src = '';
    playerVideo.removeAttribute('src');
    try { URL.revokeObjectURL(url); } catch (e) { }
  }
  playerOverlay.classList.remove('show');
}

// ─── Delete Recording ───────────────────────────────────────
function confirmDelete(recordingId, cameraName) {
  deleteTargetId = recordingId;
  document.getElementById('confirm-msg').textContent =
    `This will permanently delete the recording from "${cameraName}" and its video file. This action cannot be undone.`;
  confirmOverlay.classList.add('show');
}

async function executeDelete() {
  if (!deleteTargetId) return;

  try {
    const result = await window.api.recordingDelete(deleteTargetId);
    if (result.success) {
      showToast('Recording deleted');
      await loadRecordings();
    } else {
      showToast('Failed to delete recording: ' + result.error, true);
    }
  } catch (err) {
    console.error('Error deleting recording:', err);
    showToast('Error deleting recording', true);
  }

  deleteTargetId = null;
  confirmOverlay.classList.remove('show');
}

function cancelDelete() {
  deleteTargetId = null;
  confirmOverlay.classList.remove('show');
}

// ─── Event Listeners ────────────────────────────────────────

// Back button
document.getElementById('btn-back').addEventListener('click', () => {
  closePlayer();
  window.location.href = 'camera.html';
});

// Filter
recFilter.addEventListener('change', renderRecordings);

// Open folder
document.getElementById('btn-open-folder').addEventListener('click', async () => {
  await window.api.recordingOpenFolder();
});

// Player close
document.getElementById('player-close').addEventListener('click', closePlayer);
playerOverlay.addEventListener('click', (e) => {
  if (e.target === playerOverlay) closePlayer();
});

// Confirm dialog
document.getElementById('confirm-cancel').addEventListener('click', cancelDelete);
document.getElementById('confirm-delete').addEventListener('click', executeDelete);
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) cancelDelete();
});

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (confirmOverlay.classList.contains('show')) {
      cancelDelete();
    } else if (playerOverlay.classList.contains('show')) {
      closePlayer();
    }
  }
});

// ─── Initialize ─────────────────────────────────────────────
loadRecordings();
