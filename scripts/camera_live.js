/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Live Camera Preview & Recording Logic
   ════════════════════════════════════════════════════════════ */

// ─── State ──────────────────────────────────────────────────
let currentSource = 'webcam';   // 'webcam' or 'cctv'
let cctvCameraId = null;
let cctvStreamId = null;

// Webcam state
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let cameraDevices = [];
let currentDeviceIndex = 0;
let facingMode = 'user';

// Recording state
let isRecording = false;
let recordingStartTime = null;
let timerInterval = null;
let currentRecordingId = null;

// ─── DOM Elements ───────────────────────────────────────────
const videoPreview = document.getElementById('video-preview');
const cctvPreview = document.getElementById('cctv-preview');
const videoPlaceholder = document.getElementById('video-placeholder');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const camName = document.getElementById('cam-name');
const camSource = document.getElementById('cam-source');
const camInfoIcon = document.getElementById('cam-info-icon');
const btnRecord = document.getElementById('btn-record');
const btnRecordText = document.getElementById('btn-record-text');
const recTimer = document.getElementById('rec-timer');
const recIndicator = document.getElementById('rec-indicator');
const recIndicatorTimer = document.getElementById('rec-indicator-timer');
const btnSwitchCamera = document.getElementById('btn-switch-camera');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');

// ─── Wireless Phone Functions ─────────────────────────────────

// ─── Wireless Phone Functions ─────────────────────────────────

let wirelessCanvas = null;
let wirelessCtx = null;

async function startWirelessStream() {
  setStatus('CONNECTING');
  videoPreview.style.display = 'none';
  videoPlaceholder.style.display = 'none';
  cctvPreview.style.display = 'block';
  
  wirelessCanvas = document.getElementById('wireless-canvas');
  wirelessCtx = wirelessCanvas.getContext('2d');
  
  // Set default canvas size, will update when frame arrives
  wirelessCanvas.width = 1280;
  wirelessCanvas.height = 720;
  
  // Create a MediaStream from the canvas for recording
  mediaStream = wirelessCanvas.captureStream(30); // 30 FPS

  window.api.onWirelessFrame((data) => {
    // We receive base64 jpeg from phone
    cctvPreview.src = data.frame;
    
    // Draw to canvas for recording
    const img = new Image();
    img.onload = () => {
      if (wirelessCanvas.width !== img.width) {
        wirelessCanvas.width = img.width;
        wirelessCanvas.height = img.height;
      }
      wirelessCtx.drawImage(img, 0, 0);
    };
    img.src = data.frame;

    if (statusText.textContent !== 'LIVE' && statusText.textContent !== 'RECORDING') {
      setStatus('LIVE');
      btnRecord.disabled = false;
    }
  });

  window.api.onWirelessStatus((data) => {
    if (data.status === 'LIVE' && !isRecording) {
      setStatus('LIVE');
    } else if (data.status === 'DISCONNECTED') {
      setStatus('ERROR');
      showError('Wireless Phone Disconnected');
      btnRecord.disabled = true;
      if (isRecording) stopRecording();
    }
  });

  window.api.onWirelessRecordTrigger && window.api.onWirelessRecordTrigger((data) => {
    if (data.action === 'start' && !isRecording) {
      startRecording();
    } else if (data.action === 'stop' && isRecording) {
      stopRecording();
    }
  });
}

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

// ─── Parse URL Params ───────────────────────────────────────
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get('source') || 'webcam',
    cameraId: params.get('cameraId') ? parseInt(params.get('cameraId')) : null,
    invoiceId: params.get('invoiceId') ? parseInt(params.get('invoiceId')) : null,
    autoRecord: params.get('autoRecord') === 'true'
  };
}

// ─── Status Management ──────────────────────────────────────
function setStatus(status) {
  const statusMap = {
    'CONNECTING': 'status-badge--connecting',
    'LIVE': 'status-badge--live',
    'RECORDING': 'status-badge--recording',
    'RECONNECTING': 'status-badge--reconnecting',
    'STOPPING': 'status-badge--stopping',
    'SAVED': 'status-badge--saved',
    'ERROR': 'status-badge--error'
  };

  statusBadge.className = 'status-badge ' + (statusMap[status] || 'status-badge--connecting');
  statusText.textContent = status;
}

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.classList.add('show');
}

function hideError() {
  errorMsg.classList.remove('show');
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

// ─── Timer ──────────────────────────────────────────────────
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startTimer() {
  recordingStartTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const timeStr = formatTime(elapsed);
    recTimer.textContent = timeStr;
    recIndicatorTimer.textContent = timeStr;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetTimer() {
  recTimer.textContent = '00:00:00';
  recTimer.classList.remove('recording');
  recIndicatorTimer.textContent = '00:00:00';
}

// ─── Webcam Functions ───────────────────────────────────────

async function enumerateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameraDevices = devices.filter(d => d.kind === 'videoinput');
    if (cameraDevices.length > 1) {
      btnSwitchCamera.style.display = '';
    }
    return cameraDevices;
  } catch (e) {
    console.error('Error enumerating cameras:', e);
    return [];
  }
}

async function startWebcam(deviceId) {
  try {
    setStatus('CONNECTING');
    hideError();
    videoPlaceholder.style.display = '';

    // Stop any existing stream
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
    }

    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true
    };

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (audioErr) {
      // If audio fails, try video only
      console.warn('Microphone unavailable, recording without audio:', audioErr.message);
      constraints.audio = false;
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    }

    videoPreview.srcObject = mediaStream;
    videoPreview.style.display = '';
    cctvPreview.style.display = 'none';
    videoPlaceholder.style.display = 'none';

    // Get the active camera's label
    const videoTrack = mediaStream.getVideoTracks()[0];
    if (videoTrack) {
      camName.textContent = videoTrack.label || 'Webcam';

      // Listen for track ended (camera disconnect)
      videoTrack.onended = () => {
        setStatus('ERROR');
        showError('Camera disconnected. Please reconnect the camera.');
        btnRecord.disabled = true;
      };
    }

    setStatus('LIVE');
    btnRecord.disabled = false;

    // Enumerate cameras after getting permission
    await enumerateCameras();

  } catch (error) {
    console.error('Webcam error:', error);
    setStatus('ERROR');
    videoPlaceholder.style.display = '';

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      showError('Camera permission denied. Please allow camera access in your system settings.');
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      showError('No camera found. Please connect a webcam or USB camera.');
    } else if (error.name === 'NotReadableError') {
      showError('Camera is in use by another application. Please close other apps using the camera.');
    } else {
      showError(`Camera error: ${error.message}`);
    }
    btnRecord.disabled = true;
  }
}

async function switchCamera() {
  if (cameraDevices.length < 2) return;

  currentDeviceIndex = (currentDeviceIndex + 1) % cameraDevices.length;
  const device = cameraDevices[currentDeviceIndex];
  await startWebcam(device.deviceId);
}

function startWebcamRecording() {
  if (!mediaStream) return;

  recordedChunks = [];
  const mimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];

  let mimeType = '';
  for (const mt of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mt)) {
      mimeType = mt;
      break;
    }
  }

  if (!mimeType) {
    showError('No supported video recording format available in this browser.');
    return;
  }

  try {
    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType,
      videoBitsPerSecond: 2500000 // 2.5 Mbps
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      setStatus('STOPPING');
      btnRecord.disabled = true;

      try {
        const blob = new Blob(recordedChunks, { type: mimeType });
        const arrayBuffer = await blob.arrayBuffer();
        const videoBuffer = Array.from(new Uint8Array(arrayBuffer));

        const startTimeStr = new Date(recordingStartTime).toISOString().replace('T', ' ').substring(0, 19);
        const durationSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);

        const { invoiceId } = getUrlParams();
        const result = await window.api.webcamSaveRecording({
          cameraName: camName.textContent,
          startTime: startTimeStr,
          durationSeconds,
          videoBuffer,
          invoiceId
        });

        if (result.success) {
          setStatus('SAVED');
          showToast(`Recording saved (${formatFileSize(result.fileSize)})`);
          
          if (invoiceId) {
            setTimeout(() => {
              window.location.href = `customers.html?playInvoiceId=${invoiceId}`;
            }, 1500);
          }
        } else {
          setStatus('ERROR');
          showError('Failed to save recording: ' + result.error);
        }
      } catch (err) {
        console.error('Error saving recording:', err);
        setStatus('ERROR');
        showError('Error saving recording: ' + err.message);
      }

      // Reset UI after short delay
      setTimeout(() => {
        if (!isRecording) {
          setStatus('LIVE');
          btnRecord.disabled = false;
        }
      }, 2000);
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
      showError('Recording error: ' + (event.error?.message || 'Unknown error'));
      stopRecording();
    };

    mediaRecorder.start(1000); // Collect data every second
    isRecording = true;
    recordedChunks = [];

  } catch (error) {
    console.error('Failed to start recording:', error);
    showError('Failed to start recording: ' + error.message);
  }
}

function stopWebcamRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

// ─── CCTV Functions ─────────────────────────────────────────

async function startCctvStream(cameraId) {
  try {
    setStatus('CONNECTING');
    hideError();
    videoPlaceholder.style.display = '';
    videoPreview.style.display = 'none';
    cctvPreview.style.display = '';

    const result = await window.api.cctvStartStream({ cameraId });
    if (!result.success) {
      throw new Error(result.error);
    }

    cctvStreamId = result.streamId;
    camName.textContent = result.cameraName;

    // Listen for frames
    window.api.onCctvFrame((data) => {
      if (data.streamId === cctvStreamId) {
        cctvPreview.src = data.frame;
        if (videoPlaceholder.style.display !== 'none') {
          videoPlaceholder.style.display = 'none';
        }
      }
    });

    // Listen for status
    window.api.onCctvStatus((data) => {
      if (data.streamId === cctvStreamId) {
        if (data.status === 'LIVE' && !isRecording) {
          setStatus('LIVE');
          btnRecord.disabled = false;
        } else if (data.status === 'DISCONNECTED') {
          setStatus('RECONNECTING');
          showError('CCTV stream disconnected. Attempting reconnection...');
          // Attempt reconnect after 5 seconds
          setTimeout(() => {
            if (cctvStreamId === data.streamId) {
              reconnectCctv();
            }
          }, 5000);
        } else if (data.status === 'ERROR') {
          setStatus('ERROR');
          showError(data.error || 'CCTV stream error');
          btnRecord.disabled = true;
        }
      }
    });

    // Listen for recording errors
    window.api.onRecordingError((data) => {
      showError(data.error || 'Recording error');
      showToast(data.error || 'Recording error', true);
    });

    // Stream starts, wait for first frame for LIVE status
    setTimeout(() => {
      if (cctvPreview.src && cctvPreview.naturalWidth > 0) {
        setStatus('LIVE');
        btnRecord.disabled = false;
      }
    }, 3000);

  } catch (error) {
    console.error('CCTV stream error:', error);
    setStatus('ERROR');
    showError(error.message || 'Failed to connect to CCTV camera');
    btnRecord.disabled = true;
  }
}

async function reconnectCctv() {
  if (!cctvCameraId) return;

  setStatus('RECONNECTING');
  hideError();

  // Stop old stream
  if (cctvStreamId) {
    try { await window.api.cctvStopStream(cctvStreamId); } catch (e) { }
    window.api.removeCctvListeners();
    cctvStreamId = null;
  }

  // Retry
  await startCctvStream(cctvCameraId);
}

async function startCctvRecording() {
  try {
    const result = await window.api.cctvStartRecording({
      cameraId: cctvCameraId,
      streamId: cctvStreamId
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    currentRecordingId = result.recordingId;
    isRecording = true;
  } catch (error) {
    console.error('CCTV recording error:', error);
    showError('Failed to start CCTV recording: ' + error.message);
    isRecording = false;
  }
}

async function stopCctvRecording() {
  if (!currentRecordingId) return;

  try {
    setStatus('STOPPING');
    const result = await window.api.cctvStopRecording(currentRecordingId);
    if (result.success) {
      setStatus('SAVED');
      showToast('CCTV recording saved');
    } else {
      showError('Failed to finalize recording: ' + result.error);
    }
  } catch (error) {
    console.error('Error stopping CCTV recording:', error);
    showError('Error stopping recording: ' + error.message);
  }

  currentRecordingId = null;

  // Return to live state
  setTimeout(() => {
    if (!isRecording) {
      setStatus('LIVE');
      btnRecord.disabled = false;
    }
  }, 2000);
}

// ─── Unified Recording Control ──────────────────────────────

function startRecording() {
  isRecording = true;
  hideError();
  setStatus('RECORDING');
  recTimer.classList.add('recording');
  recIndicator.classList.add('show');
  btnRecord.className = 'btn-record btn-record--stop';
  btnRecordText.textContent = 'Stop Recording';
  btnRecord.querySelector('.material-icons-round').textContent = 'stop';
  startTimer();

  if (currentSource === 'webcam' || currentSource === 'wireless') {
    startWebcamRecording();
  } else {
    startCctvRecording();
  }
}

function stopRecording() {
  isRecording = false;
  stopTimer();
  recIndicator.classList.remove('show');
  btnRecord.className = 'btn-record btn-record--start';
  btnRecordText.textContent = 'Start Recording';
  btnRecord.querySelector('.material-icons-round').textContent = 'fiber_manual_record';
  recTimer.classList.remove('recording');

  if (currentSource === 'webcam' || currentSource === 'wireless') {
    stopWebcamRecording();
  } else {
    stopCctvRecording();
  }

  // Timer will be reset by the save callback
}

// ─── Cleanup ────────────────────────────────────────────────
async function cleanup() {
  // Stop recording if active
  if (isRecording) {
    stopRecording();
  }

  // Stop webcam
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }

  // Stop CCTV stream
  if (cctvStreamId) {
    try { await window.api.cctvStopStream(cctvStreamId); } catch (e) { }
    window.api.removeCctvListeners();
    cctvStreamId = null;
  }

  if (currentSource === 'wireless') {
    window.api.removeWirelessListeners();
    // Intentionally DO NOT stop the server, so the phone stays connected
    // when returning to the setup screen.
  }

  stopTimer();
}

// ─── Utility ────────────────────────────────────────────────
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

// ─── Event Listeners ────────────────────────────────────────

// Back button
document.getElementById('btn-back').addEventListener('click', async () => {
  await cleanup();
  const { invoiceId } = getUrlParams();
  if (currentSource === 'cctv') {
    window.location.href = 'cctv_setup.html';
  } else if (currentSource === 'wireless') {
    let nextUrl = 'camera_wireless_setup.html';
    if (invoiceId) {
      nextUrl += `?invoiceId=${invoiceId}`;
    }
    window.location.href = nextUrl;
  } else {
    window.location.href = 'camera.html';
  }
});

// Record button
btnRecord.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// Camera switch
btnSwitchCamera.addEventListener('click', async () => {
  if (!isRecording) {
    await switchCamera();
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  cleanup();
});

// Handle visibility change (app going to background)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isRecording && currentSource === 'webcam') {
    // Webcam recording may continue since Electron keeps the process alive
    // Show a notice when user returns
    console.log('[Camera] App went to background while recording');
  }
});

// ─── Initialize ─────────────────────────────────────────────
(async function init() {
  const params = getUrlParams();
  currentSource = params.source;
  cctvCameraId = params.cameraId;

  btnRecord.disabled = true;

  if (currentSource === 'cctv') {
    // CCTV mode
    camSource.textContent = 'CCTV / IP CAMERA';
    camInfoIcon.querySelector('.material-icons-round').textContent = 'linked_camera';
    camInfoIcon.style.background = 'var(--accent-purple-dim)';
    camInfoIcon.querySelector('.material-icons-round').style.color = 'var(--accent-purple)';
    document.getElementById('header-icon').textContent = 'linked_camera';
    document.getElementById('header-title').textContent = 'CCTV Live View';
    btnSwitchCamera.style.display = 'none';

    if (cctvCameraId) {
      await startCctvStream(cctvCameraId);
    } else {
      setStatus('ERROR');
      showError('No CCTV camera selected. Go back and select a camera.');
    }
  } else if (currentSource === 'wireless') {
    // Wireless Phone mode
    camSource.textContent = 'WIRELESS PHONE';
    camName.textContent = 'Mobile Device';
    camInfoIcon.querySelector('.material-icons-round').textContent = 'smartphone';
    camInfoIcon.style.background = 'rgba(251,146,60,0.15)';
    camInfoIcon.querySelector('.material-icons-round').style.color = 'rgb(251,146,60)';
    document.getElementById('header-icon').textContent = 'smartphone';
    document.getElementById('header-title').textContent = 'Wireless Live View';
    btnSwitchCamera.style.display = 'none';
    
    // We repurpose the CCTV recording pipeline since we just stream frames
    cctvCameraId = 'WIRELESS'; 
    await startWirelessStream();
    
    if (params.autoRecord) {
      setTimeout(() => {
        if (!isRecording && statusText.textContent === 'LIVE') {
          startRecording();
        }
      }, 1000);
    }
  } else {
    // Webcam mode
    camSource.textContent = 'WEBCAM';
    camInfoIcon.querySelector('.material-icons-round').textContent = 'photo_camera';
    document.getElementById('header-icon').textContent = 'photo_camera';
    document.getElementById('header-title').textContent = 'Webcam Live View';

    await startWebcam();
  }
})();
