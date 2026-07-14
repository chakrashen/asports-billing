/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — CCTV / IP Camera Setup Logic
   ════════════════════════════════════════════════════════════ */

// ─── State ──────────────────────────────────────────────────
let cameras = [];
let editingCameraId = null;
let deleteTargetId = null;

// ─── DOM Elements ───────────────────────────────────────────
const cameraList = document.getElementById('camera-list');
const cameraEmpty = document.getElementById('camera-empty');
const formTitle = document.getElementById('form-title');
const btnSave = document.getElementById('btn-save-camera');
const btnSaveText = document.getElementById('btn-save-text');
const btnTest = document.getElementById('btn-test-connection');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const testResult = document.getElementById('test-result');
const testResultIcon = document.getElementById('test-result-icon');
const testResultText = document.getElementById('test-result-text');
const confirmOverlay = document.getElementById('confirm-overlay');

// Form inputs
const inputName = document.getElementById('cam-name');
const inputRtspUrl = document.getElementById('cam-rtsp-url');
const inputUsername = document.getElementById('cam-username');
const inputPassword = document.getElementById('cam-password');

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

function hideTestResult() {
  testResult.classList.remove('show');
  testResult.className = 'cctv-test-result';
}

function showTestResult(success, message) {
  testResult.classList.add('show');
  if (success) {
    testResult.className = 'cctv-test-result show cctv-test-result--success';
    testResultIcon.textContent = 'check_circle';
  } else {
    testResult.className = 'cctv-test-result show cctv-test-result--error';
    testResultIcon.textContent = 'error';
  }
  testResultText.textContent = message;
}

function maskUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    // Show host:port/path but mask credentials
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch (e) {
    // Return first 30 chars
    return url.length > 35 ? url.substring(0, 30) + '...' : url;
  }
}

// ─── Form Management ────────────────────────────────────────

function clearForm() {
  inputName.value = '';
  inputRtspUrl.value = '';
  inputUsername.value = '';
  inputPassword.value = '';
  editingCameraId = null;
  formTitle.textContent = 'Add New Camera';
  btnSaveText.textContent = 'Save Camera';
  btnCancelEdit.style.display = 'none';
  hideTestResult();
}

function populateForm(camera) {
  inputName.value = camera.name || '';
  inputRtspUrl.value = camera.rtsp_url || '';
  inputUsername.value = camera.username || '';
  inputPassword.value = ''; // Never pre-fill password
  inputPassword.placeholder = 'Leave blank to keep current';
  editingCameraId = camera.id;
  formTitle.textContent = 'Edit Camera';
  btnSaveText.textContent = 'Update Camera';
  btnCancelEdit.style.display = '';
  hideTestResult();
  inputName.focus();
}

function validateForm() {
  const name = inputName.value.trim();
  const rtspUrl = inputRtspUrl.value.trim();

  if (!name) {
    showToast('Please enter a camera name', true);
    inputName.focus();
    return false;
  }

  if (!rtspUrl) {
    showToast('Please enter the RTSP URL', true);
    inputRtspUrl.focus();
    return false;
  }

  if (!rtspUrl.startsWith('rtsp://') && !rtspUrl.startsWith('rtsps://')) {
    showToast('RTSP URL must start with rtsp:// or rtsps://', true);
    inputRtspUrl.focus();
    return false;
  }

  return true;
}

// ─── Load Cameras ───────────────────────────────────────────

async function loadCameras() {
  try {
    const result = await window.api.cctvGetCameras();
    if (!result.success) {
      showToast('Failed to load cameras: ' + result.error, true);
      return;
    }
    cameras = result.cameras;
    renderCameras();
  } catch (err) {
    console.error('Error loading cameras:', err);
    showToast('Error loading cameras', true);
  }
}

// ─── Render Camera List ─────────────────────────────────────

function renderCameras() {
  if (cameras.length === 0) {
    cameraList.innerHTML = '';
    cameraEmpty.style.display = '';
    return;
  }

  cameraEmpty.style.display = 'none';

  cameraList.innerHTML = cameras.map(cam => `
    <div class="cctv-camera-item" data-id="${cam.id}">
      <div class="cctv-camera-item__icon">
        <span class="material-icons-round">linked_camera</span>
      </div>
      <div class="cctv-camera-item__info">
        <div class="cctv-camera-item__name">${escapeHtml(cam.name)}</div>
        <div class="cctv-camera-item__url">${escapeHtml(maskUrl(cam.rtsp_url))}</div>
      </div>
      <div class="cctv-camera-item__actions">
        <button class="cctv-action-btn cctv-action-btn--connect" title="Connect & View" onclick="connectCamera(${cam.id})">
          <span class="material-icons-round">play_arrow</span>
          <span>Live</span>
        </button>
        <button class="cctv-action-btn" title="Edit" onclick="editCamera(${cam.id})">
          <span class="material-icons-round">edit</span>
        </button>
        <button class="cctv-action-btn cctv-action-btn--delete" title="Delete" onclick="confirmDeleteCamera(${cam.id}, '${escapeHtml(cam.name)}')">
          <span class="material-icons-round">delete</span>
        </button>
      </div>
    </div>
  `).join('');
}

// ─── Save Camera ────────────────────────────────────────────

async function saveCamera() {
  if (!validateForm()) return;

  const data = {
    name: inputName.value.trim(),
    rtspUrl: inputRtspUrl.value.trim(),
    username: inputUsername.value.trim(),
    password: inputPassword.value
  };

  try {
    btnSave.disabled = true;
    let result;

    if (editingCameraId) {
      data.id = editingCameraId;
      result = await window.api.cctvUpdateCamera(data);
    } else {
      result = await window.api.cctvSaveCamera(data);
    }

    if (result.success) {
      showToast(editingCameraId ? 'Camera updated' : 'Camera saved');
      clearForm();
      await loadCameras();
    } else {
      showToast('Failed to save camera: ' + result.error, true);
    }
  } catch (err) {
    console.error('Error saving camera:', err);
    showToast('Error saving camera', true);
  } finally {
    btnSave.disabled = false;
  }
}

// ─── Edit Camera ────────────────────────────────────────────

async function editCamera(cameraId) {
  try {
    const result = await window.api.cctvGetCamera(cameraId);
    if (result.success) {
      populateForm(result.camera);
    } else {
      showToast('Failed to load camera details', true);
    }
  } catch (err) {
    showToast('Error loading camera', true);
  }
}

// ─── Delete Camera ──────────────────────────────────────────

function confirmDeleteCamera(cameraId, cameraName) {
  deleteTargetId = cameraId;
  document.getElementById('confirm-msg').textContent =
    `This will remove "${cameraName}" from your saved cameras. Existing recordings from this camera will not be deleted.`;
  confirmOverlay.classList.add('show');
}

async function executeDelete() {
  if (!deleteTargetId) return;

  try {
    const result = await window.api.cctvDeleteCamera(deleteTargetId);
    if (result.success) {
      showToast('Camera deleted');
      if (editingCameraId === deleteTargetId) {
        clearForm();
      }
      await loadCameras();
    } else {
      showToast('Failed to delete camera: ' + result.error, true);
    }
  } catch (err) {
    showToast('Error deleting camera', true);
  }

  deleteTargetId = null;
  confirmOverlay.classList.remove('show');
}

function cancelDelete() {
  deleteTargetId = null;
  confirmOverlay.classList.remove('show');
}

// ─── Test Connection ────────────────────────────────────────

async function testConnection() {
  const rtspUrl = inputRtspUrl.value.trim();
  if (!rtspUrl) {
    showToast('Please enter an RTSP URL first', true);
    inputRtspUrl.focus();
    return;
  }

  if (!rtspUrl.startsWith('rtsp://') && !rtspUrl.startsWith('rtsps://')) {
    showToast('RTSP URL must start with rtsp:// or rtsps://', true);
    return;
  }

  hideTestResult();
  btnTest.disabled = true;
  btnTest.innerHTML = '<span class="material-icons-round" style="animation: spin 1s linear infinite;">sync</span> Testing...';

  try {
    const result = await window.api.cctvTestConnection({
      rtspUrl,
      username: inputUsername.value.trim(),
      password: inputPassword.value
    });

    showTestResult(result.success, result.success ? result.message : result.error);
  } catch (err) {
    showTestResult(false, 'Test failed: ' + err.message);
  } finally {
    btnTest.disabled = false;
    btnTest.innerHTML = '<span class="material-icons-round">wifi_tethering</span> Test Connection';
  }
}

// ─── Connect to Camera (navigate to live view) ──────────────

function connectCamera(cameraId) {
  window.location.href = `camera_live.html?source=cctv&cameraId=${cameraId}`;
}

// ─── Event Listeners ────────────────────────────────────────

// Back button
document.getElementById('btn-back').addEventListener('click', () => {
  window.location.href = 'camera.html';
});

// Save
btnSave.addEventListener('click', saveCamera);

// Test
btnTest.addEventListener('click', testConnection);

// Cancel edit
btnCancelEdit.addEventListener('click', () => {
  clearForm();
  inputPassword.placeholder = '••••••••';
});

// Confirm dialog
document.getElementById('confirm-cancel').addEventListener('click', cancelDelete);
document.getElementById('confirm-delete').addEventListener('click', executeDelete);
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) cancelDelete();
});

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && confirmOverlay.classList.contains('show')) {
    cancelDelete();
  }
});

// Enter key on form fields
[inputName, inputRtspUrl, inputUsername, inputPassword].forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveCamera();
    }
  });
});

// ─── Add spin animation ─────────────────────────────────────
const style = document.createElement('style');
style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ─── Initialize ─────────────────────────────────────────────
loadCameras();
