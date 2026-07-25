/* ════════════════════════════════════════════════════════════
   ASPORTS ZONE — Camera Manager Module
   ════════════════════════════════════════════════════════════
   
   Modular camera system that embeds a live camera panel into
   the Customer Directory page. Supports:
     • USB / built-in webcam
     • Local video file (for testing without hardware)
     • RTSP CCTV (via navigation to existing cctv_setup.html)
     • ONVIF cameras (via RTSP URL)

   No changes to existing code are required to switch sources.
   Public API:
     CameraManager.init()
     CameraManager.startRecordingForInvoice(invoiceId, customerName, invoiceDisplay)
     CameraManager.stopRecordingForInvoice(invoiceId)
     CameraManager.openPanel()
     CameraManager.closePanel()
   ════════════════════════════════════════════════════════════ */

const CameraManager = (() => {
  'use strict';

  // ─── State ─────────────────────────────────────────────────
  const state = {
    isPanelOpen: false,
    sourceType: 'webcam',        // 'webcam' | 'file' | 'cctv'
    mediaStream: null,
    mediaRecorder: null,
    recordedChunks: [],
    cameraDevices: [],
    currentDeviceIndex: 0,
    isLive: false,
    isRecording: false,
    activeInvoiceId: null,
    activeCustomerName: null,
    activeInvoiceDisplay: null,
    recordingStartTime: null,
    timerInterval: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 3,
    reconnectDelay: 5000,
    status: 'idle',               // 'idle'|'connecting'|'live'|'recording'|'error'|'reconnecting'
    fileVideoEl: null,             // <video> element for file source
    reconnectTimer: null,
  };

  // ─── DOM References (populated in init) ────────────────────
  let dom = {};

  // ─── Panel HTML Template ────────────────────────────────────
  function buildPanelHTML() {
    return `
      <!-- Camera Toggle Button -->
      <button class="cam-panel-toggle-btn" id="cam-panel-toggle-btn" title="Open Live Camera">
        <span class="cam-rec-dot"></span>
        <span class="material-icons-round" style="font-size:18px;">videocam</span>
        <span id="cam-toggle-label">Live Camera</span>
      </button>

      <!-- Camera Panel -->
      <div class="cam-panel" id="cam-panel" role="dialog" aria-label="Live Camera Panel">

        <!-- Header -->
        <div class="cam-panel__header">
          <div class="cam-panel__header-left">
            <div class="cam-panel__header-icon">
              <span class="material-icons-round" style="font-size:16px;">videocam</span>
            </div>
            <div>
              <div class="cam-panel__title">Live Camera</div>
              <div class="cam-panel__subtitle" id="cam-panel-subtitle">SELECT SOURCE TO BEGIN</div>
            </div>
          </div>
          <div class="cam-panel__header-right">
            <div class="cam-panel__status-badge cam-panel__status-badge--idle" id="cam-status-badge">
              <span class="cam-panel__status-dot"></span>
              <span id="cam-status-text">IDLE</span>
            </div>
            <button class="cam-panel__close-btn" id="cam-panel-close-btn" title="Close Camera Panel">
              <span class="material-icons-round" style="font-size:16px;">close</span>
            </button>
          </div>
        </div>

        <!-- Reconnect Progress Bar -->
        <div class="cam-reconnect-bar" id="cam-reconnect-bar"></div>

        <!-- Error Banner -->
        <div class="cam-panel__error" id="cam-error-banner">
          <span class="material-icons-round">error_outline</span>
          <span class="cam-panel__error-text" id="cam-error-text">Camera error</span>
          <button class="cam-panel__retry-btn" id="cam-retry-btn">Retry</button>
        </div>

        <!-- Source Selector -->
        <div class="cam-panel__source-bar">
          <span class="cam-panel__source-label">Source</span>
          <select class="cam-panel__source-select" id="cam-source-select" title="Select Camera Source">
            <option value="webcam">📷 Webcam / USB Camera</option>
            <option value="file">🎬 Local Video File (Testing)</option>
            <option value="cctv">🎥 RTSP / CCTV / ONVIF</option>
          </select>
          <button class="cam-panel__cam-switch-btn" id="cam-switch-btn" title="Switch Camera" disabled>
            <span class="material-icons-round">cameraswitch</span>
          </button>
        </div>

        <!-- Hidden file input for 'file' source -->
        <input type="file" id="cam-file-input" accept="video/mp4,video/webm,video/*">

        <!-- Video Area -->
        <div class="cam-panel__video-wrap">
          <!-- Webcam video element -->
          <video class="cam-panel__video" id="cam-panel-video" autoplay playsinline muted></video>
          
          <!-- Placeholder when no feed -->
          <div class="cam-panel__placeholder" id="cam-placeholder">
            <span class="material-icons-round">videocam_off</span>
            <p id="cam-placeholder-text">Select a source above to begin</p>
          </div>

          <!-- REC overlay on video -->
          <div class="cam-panel__rec-overlay" id="cam-rec-overlay">
            <div class="rec-dot"></div>
            <span>REC</span>
          </div>

          <!-- Timer overlay -->
          <div class="cam-panel__timer-overlay" id="cam-timer-overlay">00:00:00</div>

          <!-- Active invoice label -->
          <div class="cam-panel__active-invoice" id="cam-active-invoice">
            <span class="material-icons-round" style="font-size:14px;">link</span>
            <span id="cam-active-invoice-text">Recording for Invoice</span>
          </div>
        </div>

        <!-- Controls -->
        <div class="cam-panel__controls">
          <div class="cam-panel__recording-info">
            <span class="cam-panel__recording-for">Recording linked to:</span>
            <span class="cam-panel__recording-invoice" id="cam-recording-invoice">— No invoice selected —</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="cam-panel__footer">
          <span class="cam-panel__footer-note">
            <span class="material-icons-round">info</span>
            Click <strong style="color:var(--accent-emerald); margin: 0 3px;">▶ Start</strong> on any invoice row
          </span>
          <button class="cam-panel__open-folder-btn" id="cam-open-folder-btn" title="Open saved recordings folder">
            <span class="material-icons-round" style="font-size:14px;">folder_open</span>
            Recordings
          </button>
        </div>
      </div>

      <!-- Camera Save Toast -->
      <div class="cam-save-toast" id="cam-save-toast">
        <span class="material-icons-round" id="cam-toast-icon" style="font-size:18px;">check_circle</span>
        <span id="cam-toast-text">Recording saved</span>
      </div>
    `;
  }

  // ─── Init ───────────────────────────────────────────────────
  function init() {
    // Inject HTML into the page
    const wrapper = document.createElement('div');
    wrapper.id = 'cam-manager-root';
    wrapper.innerHTML = buildPanelHTML();
    document.body.appendChild(wrapper);

    // Cache DOM references
    dom = {
      toggleBtn:       document.getElementById('cam-panel-toggle-btn'),
      toggleLabel:     document.getElementById('cam-toggle-label'),
      panel:           document.getElementById('cam-panel'),
      closeBtn:        document.getElementById('cam-panel-close-btn'),
      statusBadge:     document.getElementById('cam-status-badge'),
      statusText:      document.getElementById('cam-status-text'),
      subtitle:        document.getElementById('cam-panel-subtitle'),
      errorBanner:     document.getElementById('cam-error-banner'),
      errorText:       document.getElementById('cam-error-text'),
      retryBtn:        document.getElementById('cam-retry-btn'),
      reconnectBar:    document.getElementById('cam-reconnect-bar'),
      sourceSelect:    document.getElementById('cam-source-select'),
      switchBtn:       document.getElementById('cam-switch-btn'),
      fileInput:       document.getElementById('cam-file-input'),
      video:           document.getElementById('cam-panel-video'),
      placeholder:     document.getElementById('cam-placeholder'),
      placeholderText: document.getElementById('cam-placeholder-text'),
      recOverlay:      document.getElementById('cam-rec-overlay'),
      timerOverlay:    document.getElementById('cam-timer-overlay'),
      activeInvoice:   document.getElementById('cam-active-invoice'),
      activeInvoiceText: document.getElementById('cam-active-invoice-text'),
      recordingInvoice: document.getElementById('cam-recording-invoice'),
      openFolderBtn:   document.getElementById('cam-open-folder-btn'),
      saveToast:       document.getElementById('cam-save-toast'),
      toastIcon:       document.getElementById('cam-toast-icon'),
      toastText:       document.getElementById('cam-toast-text'),
    };

    // Bind events
    dom.toggleBtn.addEventListener('click', togglePanel);
    dom.closeBtn.addEventListener('click', closePanel);
    dom.sourceSelect.addEventListener('change', onSourceChange);
    dom.switchBtn.addEventListener('click', switchCamera);
    dom.fileInput.addEventListener('change', onFileSelected);
    dom.retryBtn.addEventListener('click', retryConnection);
    dom.openFolderBtn.addEventListener('click', () => {
      if (window.api && window.api.recordingOpenFolder) {
        window.api.recordingOpenFolder();
      }
    });

    // Close panel on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isPanelOpen && !state.isRecording) {
        closePanel();
      }
    });

    // Enumerate cameras on init for switch button
    enumerateCameras();
  }

  // ─── Panel Open / Close ─────────────────────────────────────
  function togglePanel() {
    if (state.isPanelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    state.isPanelOpen = true;
    dom.panel.classList.add('show');
    // Auto-start webcam if no stream yet
    if (!state.isLive && state.sourceType === 'webcam') {
      startWebcam();
    }
  }

  function closePanel() {
    if (state.isRecording) {
      showToast('Stop the active recording before closing', true);
      return;
    }
    state.isPanelOpen = false;
    dom.panel.classList.remove('show');
  }

  // ─── Source Selection ───────────────────────────────────────
  function onSourceChange() {
    const newSource = dom.sourceSelect.value;

    // Stop current stream if changing source
    if (state.isLive || state.mediaStream) {
      stopCurrentStream();
    }
    hideError();
    state.sourceType = newSource;
    state.reconnectAttempts = 0;

    switch (newSource) {
      case 'webcam':
        dom.subtitle.textContent = 'WEBCAM / USB CAMERA';
        startWebcam();
        break;

      case 'file':
        dom.subtitle.textContent = 'LOCAL VIDEO FILE';
        dom.fileInput.click();
        break;

      case 'cctv':
        // Navigate to existing CCTV setup page - keeps things modular
        stopCurrentStream();
        setStatus('idle');
        showPlaceholder('cctv-redirect');
        break;
    }
  }

  function showPlaceholder(mode) {
    dom.video.classList.remove('show');
    dom.placeholder.classList.remove('hide');

    if (mode === 'cctv-redirect') {
      dom.placeholderText.innerHTML = `
        RTSP/ONVIF cameras use the dedicated CCTV setup.<br>
        <button onclick="CameraManager._goToCctvSetup()" style="
          margin-top:12px; padding:8px 20px; border-radius:8px;
          border:1px solid rgba(168,85,247,0.4); background:rgba(168,85,247,0.12);
          color:#a855f7; font-size:0.8rem; font-weight:700; cursor:pointer;
          display:inline-flex; align-items:center; gap:6px;">
          <span class='material-icons-round' style='font-size:16px;'>launch</span>
          Open CCTV Setup
        </button>
      `;
    } else {
      dom.placeholderText.textContent = 'Select a source above to begin';
    }
  }

  // Exposed for the inline button in the placeholder HTML
  function _goToCctvSetup() {
    window.location.href = 'cctv_setup.html';
  }

  // ─── Webcam Functions ───────────────────────────────────────
  async function enumerateCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.cameraDevices = devices.filter(d => d.kind === 'videoinput');
      dom.switchBtn.disabled = state.cameraDevices.length < 2;
    } catch (e) {
      console.warn('[CameraManager] Could not enumerate cameras:', e.message);
    }
  }

  async function startWebcam(deviceId) {
    setStatus('connecting');
    hideError();
    dom.placeholderText.textContent = 'Starting camera...';
    dom.video.classList.remove('show');
    dom.placeholder.classList.remove('hide');

    try {
      if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(t => t.stop());
        state.mediaStream = null;
      }

      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      };

      try {
        state.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (audioErr) {
        console.warn('[CameraManager] Audio unavailable, retrying video-only:', audioErr.message);
        constraints.audio = false;
        state.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      dom.video.srcObject = state.mediaStream;
      dom.video.classList.add('show');
      dom.placeholder.classList.add('hide');
      state.isLive = true;
      state.reconnectAttempts = 0;
      setStatus('live');

      const track = state.mediaStream.getVideoTracks()[0];
      if (track) {
        dom.subtitle.textContent = track.label || 'WEBCAM';
        track.onended = () => handleCameraDisconnect('Camera disconnected. Please reconnect.');
      }

      await enumerateCameras();

    } catch (err) {
      console.error('[CameraManager] Webcam error:', err);
      state.isLive = false;
      setStatus('error');
      dom.placeholder.classList.remove('hide');
      dom.video.classList.remove('show');
      dom.placeholderText.textContent = 'Camera unavailable';

      let msg = 'Camera error: ' + err.message;
      if (err.name === 'NotAllowedError') msg = 'Camera access denied. Allow camera permissions in system settings.';
      else if (err.name === 'NotFoundError') msg = 'No camera found. Connect a webcam or USB camera.';
      else if (err.name === 'NotReadableError') msg = 'Camera is in use by another application.';

      showError(msg, true);
    }
  }

  async function switchCamera() {
    if (state.cameraDevices.length < 2) return;
    state.currentDeviceIndex = (state.currentDeviceIndex + 1) % state.cameraDevices.length;
    const device = state.cameraDevices[state.currentDeviceIndex];
    await startWebcam(device.deviceId);
  }

  function handleCameraDisconnect(message) {
    state.isLive = false;
    setStatus('error');
    dom.video.classList.remove('show');
    dom.placeholder.classList.remove('hide');
    dom.placeholderText.textContent = 'Camera disconnected';

    if (state.isRecording) {
      showError(message + ' Recording stopped automatically.', true);
      // Auto-stop the recording
      const invoiceId = state.activeInvoiceId;
      stopRecordingInternal(() => {
        finishRecording(invoiceId);
      });
    } else {
      showError(message, true);
    }

    // Auto-reconnect attempts
    if (state.sourceType === 'webcam' && state.reconnectAttempts < state.maxReconnectAttempts) {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    state.reconnectAttempts++;
    setStatus('reconnecting');
    dom.reconnectBar.classList.add('show');
    dom.errorText.textContent = `Camera disconnected. Reconnecting (attempt ${state.reconnectAttempts}/${state.maxReconnectAttempts})...`;

    state.reconnectTimer = setTimeout(async () => {
      dom.reconnectBar.classList.remove('show');
      if (state.sourceType === 'webcam') {
        await startWebcam();
      }
    }, state.reconnectDelay);
  }

  function retryConnection() {
    hideError();
    state.reconnectAttempts = 0;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    dom.reconnectBar.classList.remove('show');

    if (state.sourceType === 'webcam') {
      startWebcam();
    } else if (state.sourceType === 'file') {
      dom.fileInput.click();
    }
  }

  // ─── Local Video File Source (Testing Mode) ─────────────────
  function onFileSelected(e) {
    const file = e.target.files[0];
    if (!file) {
      // User cancelled, revert to webcam
      dom.sourceSelect.value = 'webcam';
      state.sourceType = 'webcam';
      startWebcam();
      return;
    }

    stopCurrentStream();
    setStatus('connecting');
    hideError();
    dom.placeholderText.textContent = 'Loading video file...';

    try {
      // Create an object URL for the file
      const fileUrl = URL.createObjectURL(file);

      // Use the panel's video element to play the file in a loop
      const videoEl = dom.video;
      videoEl.src = fileUrl;
      videoEl.srcObject = null;
      videoEl.loop = true;
      videoEl.muted = true;
      videoEl.playbackRate = 1.0;

      videoEl.onloadedmetadata = () => {
        videoEl.play();
        // Capture the video stream as a MediaStream for recording
        state.mediaStream = videoEl.captureStream(30);
        dom.video.classList.add('show');
        dom.placeholder.classList.add('hide');
        state.isLive = true;
        state.reconnectAttempts = 0;
        dom.subtitle.textContent = `FILE: ${file.name.substring(0, 25)}${file.name.length > 25 ? '…' : ''}`;
        setStatus('live');
        showToast(`Test video loaded: ${file.name}`, false);
      };

      videoEl.onerror = () => {
        setStatus('error');
        showError(`Cannot play file: ${file.name}. Try an MP4 or WebM file.`, false);
        dom.placeholderText.textContent = 'File load error';
        dom.video.classList.remove('show');
        dom.placeholder.classList.remove('hide');
      };

    } catch (err) {
      console.error('[CameraManager] File source error:', err);
      setStatus('error');
      showError('Error loading video file: ' + err.message);
    }

    // Reset file input so same file can be re-selected
    e.target.value = '';
  }

  // ─── Stop Current Stream ────────────────────────────────────
  function stopCurrentStream() {
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(t => t.stop());
      state.mediaStream = null;
    }
    if (dom.video.srcObject) {
      dom.video.srcObject = null;
    }
    if (dom.video.src && dom.video.src !== window.location.href) {
      try { URL.revokeObjectURL(dom.video.src); } catch (e) {}
      dom.video.src = '';
      dom.video.loop = false;
    }
    dom.video.classList.remove('show');
    dom.placeholder.classList.remove('hide');
    dom.placeholderText.textContent = 'Select a source above to begin';
    state.isLive = false;
    state.mediaStream = null;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    dom.reconnectBar.classList.remove('show');
  }

  // ─── Recording ──────────────────────────────────────────────

  /**
   * Called when user clicks "Start Recording" on an invoice row.
   * @param {number} invoiceId
   * @param {string} customerName
   * @param {string} invoiceDisplay  e.g. "#2026100042"
   */
  function startRecordingForInvoice(invoiceId, customerName, invoiceDisplay) {
    if (!state.isLive || !state.mediaStream) {
      openPanel();
      showToast('Open the camera panel and select a source first.', true);
      return;
    }

    if (state.isRecording) {
      showToast(`Already recording Invoice ${state.activeInvoiceDisplay}. Stop it first.`, true);
      return;
    }

    state.activeInvoiceId = invoiceId;
    state.activeCustomerName = customerName;
    state.activeInvoiceDisplay = invoiceDisplay || `#${invoiceId}`;

    // Update UI labels
    dom.recordingInvoice.textContent = `${state.activeInvoiceDisplay} — ${customerName}`;
    dom.recordingInvoice.classList.add('is-recording');
    dom.activeInvoiceText.textContent = `Recording for Invoice ${state.activeInvoiceDisplay}`;
    dom.activeInvoice.classList.add('show');

    // Start MediaRecorder
    startMediaRecorder();
  }

  /**
   * Called when user clicks "Stop Recording" on the same invoice row.
   * @param {number} invoiceId
   */
  function stopRecordingForInvoice(invoiceId) {
    if (!state.isRecording) return;
    if (state.activeInvoiceId !== invoiceId) {
      showToast(`You are recording a different invoice (${state.activeInvoiceDisplay}).`, true);
      return;
    }

    stopRecordingInternal(() => {
      finishRecording(invoiceId);
    });
  }

  function startMediaRecorder() {
    if (!state.mediaStream) return;

    state.recordedChunks = [];
    state.recordingStartTime = Date.now();

    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];

    let mimeType = '';
    for (const mt of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
    }

    if (!mimeType) {
      showError('No supported video format in this environment.');
      return;
    }

    try {
      state.mediaRecorder = new MediaRecorder(state.mediaStream, {
        mimeType,
        videoBitsPerSecond: 2_500_000  // 2.5 Mbps
      });

      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          state.recordedChunks.push(e.data);
        }
      };

      state.mediaRecorder.onstop = () => {
        // This fires after stopRecordingInternal calls mediaRecorder.stop()
        // The actual saving is handled by the callback passed to stopRecordingInternal
      };

      state.mediaRecorder.onerror = (e) => {
        console.error('[CameraManager] MediaRecorder error:', e.error);
        showError('Recording error: ' + (e.error?.message || 'Unknown error'));
        stopRecordingForInvoice(state.activeInvoiceId);
      };

      state.mediaRecorder.start(1000);  // Collect chunk every second
      state.isRecording = true;

      // Update UI
      setStatus('recording');
      dom.recOverlay.classList.add('show');
      dom.timerOverlay.classList.add('show');
      dom.toggleBtn.classList.add('is-recording');
      startTimer();

      // Update the row button(s)
      updateRowButtons(state.activeInvoiceId, true);

      // Ensure panel is open
      if (!state.isPanelOpen) openPanel();

    } catch (err) {
      console.error('[CameraManager] Failed to start MediaRecorder:', err);
      showError('Failed to start recording: ' + err.message);
      state.isRecording = false;
    }
  }

  function stopRecordingInternal(onStopped) {
    if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') {
      if (onStopped) onStopped();
      return;
    }

    // Override onstop to execute our callback
    state.mediaRecorder.onstop = () => {
      if (onStopped) onStopped();
    };
    state.mediaRecorder.stop();

    // Update UI immediately
    state.isRecording = false;
    stopTimer();
    dom.recOverlay.classList.remove('show');
    dom.timerOverlay.classList.remove('show');
    dom.toggleBtn.classList.remove('is-recording');
    dom.activeInvoice.classList.remove('show');
    dom.recordingInvoice.classList.remove('is-recording');
    dom.recordingInvoice.textContent = '— No invoice selected —';

    if (state.isLive && !state.isRecording) {
      setStatus('live');
    }

    updateRowButtons(state.activeInvoiceId, false);
  }

  async function finishRecording(invoiceId) {
    const chunks = [...state.recordedChunks];
    const startTime = state.recordingStartTime;
    const customerName = state.activeCustomerName;

    // Clear state
    state.recordedChunks = [];
    state.activeInvoiceId = null;
    state.activeCustomerName = null;
    state.activeInvoiceDisplay = null;
    state.recordingStartTime = null;

    if (chunks.length === 0) {
      showToast('No video data captured.', true);
      return;
    }

    showToast('Saving recording…', false);

    try {
      const mimeType = chunks[0].type || 'video/webm';
      const blob = new Blob(chunks, { type: mimeType });
      const arrayBuffer = await blob.arrayBuffer();
      const videoBuffer = Array.from(new Uint8Array(arrayBuffer));

      const startTimeStr = new Date(startTime).toISOString().replace('T', ' ').substring(0, 19);
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      // Use the existing IPC handler — it supports invoice_id natively
      const result = await window.api.webcamSaveRecording({
        cameraName: dom.subtitle.textContent || 'Camera',
        startTime: startTimeStr,
        durationSeconds,
        videoBuffer,
        invoiceId: invoiceId,
        customerName: customerName   // extra context (not breaking — ignored if not used)
      });

      if (result.success) {
        const mb = (result.fileSize / (1024 * 1024)).toFixed(1);
        showToast(`✓ Saved ${mb} MB — Invoice ${invoiceId}`, false);

        // Refresh the recordings indicator on the row
        setTimeout(() => refreshRowRecordingIndicator(invoiceId), 500);
      } else {
        showToast('Failed to save: ' + result.error, true);
      }
    } catch (err) {
      console.error('[CameraManager] Error saving recording:', err);
      showToast('Error saving recording: ' + err.message, true);
    }
  }

  // ─── Per-row Button State Management ────────────────────────
  function updateRowButtons(invoiceId, isRecording) {
    const btn = document.getElementById(`rec-btn-${invoiceId}`);
    const indicator = document.getElementById(`rec-indicator-${invoiceId}`);

    if (btn) {
      if (isRecording) {
        btn.classList.add('is-recording');
        btn.innerHTML = `
          <span class="material-icons-round">stop</span>
          Stop Recording
        `;
        btn.title = 'Stop Recording';
      } else {
        btn.classList.remove('is-recording');
        btn.innerHTML = `
          <span class="material-icons-round">fiber_manual_record</span>
          Start Recording
        `;
        btn.title = 'Start Recording for this invoice';
      }
    }

    if (indicator) {
      if (isRecording) {
        indicator.classList.add('show');
      } else {
        indicator.classList.remove('show');
      }
    }
  }

  async function refreshRowRecordingIndicator(invoiceId) {
    // Check if a recording now exists for this invoice and show a "has video" badge
    try {
      const result = await window.api.recordingGetAllByInvoice(invoiceId);
      if (result && result.success && result.recordings && result.recordings.length > 0) {
        const badge = document.getElementById(`rec-badge-${invoiceId}`);
        if (badge) {
          badge.style.display = 'inline-flex';
          badge.title = `${result.recordings.length} recording(s) saved`;
        }
      }
    } catch (e) {
      // non-critical
    }
  }

  // ─── Timer ──────────────────────────────────────────────────
  function startTimer() {
    state.timerInterval = setInterval(() => {
      if (!state.recordingStartTime) return;
      const elapsed = Math.floor((Date.now() - state.recordingStartTime) / 1000);
      dom.timerOverlay.textContent = formatTime(elapsed);
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    dom.timerOverlay.textContent = '00:00:00';
  }

  function formatTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  // ─── Status Management ───────────────────────────────────────
  function setStatus(status) {
    state.status = status;
    const badge = dom.statusBadge;
    const text = dom.statusText;

    // Remove all status classes
    badge.className = 'cam-panel__status-badge';

    const statusMap = {
      idle: ['cam-panel__status-badge--idle', 'IDLE'],
      connecting: ['cam-panel__status-badge--connecting', 'CONNECTING'],
      live: ['cam-panel__status-badge--live', 'LIVE'],
      recording: ['cam-panel__status-badge--recording', 'RECORDING'],
      error: ['cam-panel__status-badge--error', 'ERROR'],
      reconnecting: ['cam-panel__status-badge--connecting', 'RECONNECTING'],
    };

    const [cls, label] = statusMap[status] || ['cam-panel__status-badge--idle', status.toUpperCase()];
    badge.classList.add(cls);
    text.textContent = label;
  }

  // ─── Error Banner ────────────────────────────────────────────
  function showError(message, showRetry = true) {
    dom.errorText.textContent = message;
    dom.retryBtn.style.display = showRetry ? 'block' : 'none';
    dom.errorBanner.classList.add('show');
    setStatus('error');
  }

  function hideError() {
    dom.errorBanner.classList.remove('show');
  }

  // ─── Toast ───────────────────────────────────────────────────
  function showToast(message, isError = false) {
    const toast = dom.saveToast;
    toast.className = 'cam-save-toast' + (isError ? ' cam-save-toast--error' : '');
    dom.toastIcon.textContent = isError ? 'error' : 'check_circle';
    dom.toastText.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 4000);
  }

  // ─── Cleanup on page unload ──────────────────────────────────
  window.addEventListener('beforeunload', () => {
    if (state.isRecording) {
      stopRecordingInternal(null);
    }
    stopCurrentStream();
    stopTimer();
  });

  // ─── Public API ─────────────────────────────────────────────
  return {
    init,
    openPanel,
    closePanel,
    startRecordingForInvoice,
    stopRecordingForInvoice,
    refreshRowRecordingIndicator,
    _goToCctvSetup,    // Used by inline button in placeholder HTML
    // Expose state getter for row buttons
    getActiveInvoiceId: () => state.activeInvoiceId,
    isRecording: () => state.isRecording,
    isLive: () => state.isLive,
  };
})();
