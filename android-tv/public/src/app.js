// Dynamic host to support local dev, LAN testing, and production hosting
const isProduction = window.location.hostname.includes('sbmoffice.net');
const API_BASE = isProduction ? 'https://api.sbmoffice.net' : `http://${window.location.hostname}:3001`;
const SOCKET_URL = isProduction ? 'https://api.sbmoffice.net' : `http://${window.location.hostname}:3001`;
const CACHE_NAME = 'digital-signage-cache-v1';
const IMAGE_DURATION_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 60000;

// Safe storage wrapper: handles browsers that block localStorage (Tracking Prevention, private mode)
const safeStorage = (() => {
  let memory = {};
  let useLocal = false;
  try {
    window.localStorage.setItem('__test__', '1');
    window.localStorage.removeItem('__test__');
    useLocal = true;
  } catch {
    console.warn('localStorage blocked — using in-memory fallback');
  }
  return {
    getItem: (key) => {
      try { if (useLocal) return window.localStorage.getItem(key); } catch {}
      return memory[key] || null;
    },
    setItem: (key, value) => {
      try { if (useLocal) window.localStorage.setItem(key, value); } catch {}
      memory[key] = value;
    },
    removeItem: (key) => {
      try { if (useLocal) window.localStorage.removeItem(key); } catch {}
      delete memory[key];
    },
  };
})();

class TVPlayer {
  constructor() {
    this.deviceId = safeStorage.getItem('deviceId');
    this.deviceName = safeStorage.getItem('deviceName');
    this.deviceToken = safeStorage.getItem('deviceToken');
    this.subcenterName = safeStorage.getItem('subcenterName');
    this.socket = null;
    this.playlist = [];
    this.currentIndex = 0;
    this.overrideMedia = null;
    this.isOverrideActive = false;
    this.heartbeatInterval = null;
    this.currentMedia = null;
    this.mediaStartTime = null;
    this.cache = null;
    this.wakeLock = null;
    this.schedule = [];
    this.offlineMode = false;
    this.imageTimer = null;
    this.isPlaying = false;
    this.currentObjectUrl = null;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
    this.videoStallTimer = null;

    this.videoEl = document.getElementById('media-video');
    this.imgEl = document.getElementById('media-image');
    this.pdfEl = document.getElementById('media-pdf');
    this.textContainerEl = document.getElementById('media-text-container');
    this.ghostPrevEl = document.getElementById('ghost-prev');
    this.activeSentenceEl = document.getElementById('active-sentence');
    this.ghostNextEl = document.getElementById('ghost-next');
    this.bookUiEl = document.getElementById('book-ui');
    this.readingProgressEl = document.getElementById('reading-progress');

    this.noContentEl = document.getElementById('no-content');
    this.regEl = document.getElementById('registration');
    
    this.initTTS();
    this.unlockAudio();

    this.init();
  }

  async init() {
    await this.initCache();
    this.checkUrlParams();
    this.enableSoundOnInteraction();
    if (!this.deviceToken || !this.deviceId) {
      this.showPairing();
    } else {
      this.hideRegistration();
      this.setupKioskMode();
      this.setupFullscreen();
      this.setupWakeLock();
      this.connectSocket();
      this.startHeartbeat();
      await this.fetchDeviceInfo();
      await this.fetchSchedule();
      this.startPlayback();
    }
  }

  initTTS() {
    this.voices = [];
    this.englishVoice = null;
    this.banglaVoice = null;

    if (!window.speechSynthesis) {
      console.warn('SpeechSynthesis not supported on this browser');
      return;
    }

    const loadVoices = () => {
      try {
        this.voices = window.speechSynthesis.getVoices();
        
        const getScore = (v) => {
          const name = v.name.toLowerCase();
          let score = 0;
          // Edge/Microsoft cloud voices (highly realistic)
          if (name.includes('natural') || name.includes('online')) score += 50;
          // Apple/other premium voices
          if (name.includes('premium') || name.includes('enhanced')) score += 30;
          // Google cloud voices
          if (name.includes('google')) score += 15;
          // Good quality offline defaults
          if (name.includes('samantha') || name.includes('serena') || name.includes('ava') || name.includes('allison') || name.includes('susan')) score += 10;
          if (name.includes('zira')) score += 5;
          if (name.includes('female')) score += 5;
          // Penalize older robotic OS voices
          if (name.includes('desktop')) score -= 10;
          return score;
        };

        const bnVoices = this.voices.filter(v => v.lang.includes('bn')).sort((a, b) => getScore(b) - getScore(a));
        this.banglaVoice = bnVoices.length > 0 ? bnVoices[0] : null;

        const enVoices = this.voices.filter(v => v.lang.includes('en') || v.lang.startsWith('en-')).sort((a, b) => getScore(b) - getScore(a));
        this.englishVoice = enVoices.length > 0 ? enVoices[0] : this.voices[0];
      } catch (e) {
        console.error('Error loading voices:', e);
      }
    };

    try {
      window.speechSynthesis.onvoiceschanged = loadVoices;
      loadVoices();
    } catch (e) {
      console.error('Error binding onvoiceschanged:', e);
    }
  }

  isBengali(text) {
    const bengaliRegex = /[\u0980-\u09FF]/;
    let matchCount = 0;
    const sample = text.substring(0, 100);
    for (let i = 0; i < sample.length; i++) {
      if (bengaliRegex.test(sample[i])) matchCount++;
    }
    return matchCount > 0;
  }

  async renderTextAsBook(rawText, media) {
    if (!rawText) {
      console.warn('No text to render for book — removing from session');
      this.schedule = this.schedule.filter(item => (item.mediaId || item.id) !== media.id);
      this.playlist = this.playlist.filter(item => (item.mediaId || item.id) !== media.id);
      this.consecutiveErrors++;
      this.reportPlayback('ended', media, false);
      setTimeout(() => this.nextItem(), 1000);
      return;
    }
    const sanitizedText = rawText
      .replace(/\.+/g, '.')
      .replace(/-+/g, '-')
      .replace(/\s\s+/g, ' ')
      .trim();

    if (!sanitizedText) {
      this.consecutiveErrors = 0;
      this.reportPlayback('ended', media, true);
      this.nextItem();
      return;
    }

    const sentences = sanitizedText.match(/[^.!?।]+[.!?।]*/g) || [sanitizedText];

    // Create a unique rendering session ID to prevent ghost loops
    this.ttsRenderId = (this.ttsRenderId || 0) + 1;
    const currentRenderId = this.ttsRenderId;
    this.stopSpeech();

    let sentenceIndex = 0;

    // Reading progress
    const updateProgress = () => {
      const pct = sentences.length > 0 ? ((sentenceIndex + 1) / sentences.length) * 100 : 0;
      this.readingProgressEl.style.width = pct + '%';
    };

    // Render the monolith UI: ghost prev, active, ghost next
    const updateUI = (animate = false) => {
      const prev = sentenceIndex > 0 ? sentences[sentenceIndex - 1] : '';
      const curr = sentences[sentenceIndex] || '';
      const next = sentenceIndex < sentences.length - 1 ? sentences[sentenceIndex + 1] : '';

      if (animate && sentenceIndex > 0) {
        // Exit current active
        this.activeSentenceEl.classList.add('is-exiting');
        setTimeout(() => {
          this.activeSentenceEl.classList.remove('is-exiting');
          this.ghostPrevEl.innerText = prev;
          this.activeSentenceEl.innerText = curr;
          this.ghostNextEl.innerText = next;
          // Enter new active
          this.activeSentenceEl.classList.add('is-entering');
          setTimeout(() => this.activeSentenceEl.classList.remove('is-entering'), 60);
        }, 400);
      } else {
        this.ghostPrevEl.innerText = prev;
        this.activeSentenceEl.innerText = curr;
        this.ghostNextEl.innerText = next;
      }
    };

    const speakNext = () => {
      if (this.currentMedia !== media || this.ttsRenderId !== currentRenderId) return;

      if (sentenceIndex >= sentences.length) {
        this.consecutiveErrors = 0;
        this.reportPlayback('ended', media, true);
        setTimeout(() => this.nextItem(), 2000);
        return;
      }

      updateProgress();
      updateUI(sentenceIndex > 0);

      // Delay TTS to let the visual transition breathe
      const delay = sentenceIndex === 0 ? 700 : 600;
      setTimeout(() => speakCurrent(), delay);
    };

    const speakCurrent = () => {
      if (this.currentMedia !== media || this.ttsRenderId !== currentRenderId) return;

      const chunk = sentences[sentenceIndex].trim();
      if (!chunk) {
        sentenceIndex++;
        speakNext();
        return;
      }

      const lang = this.isBengali(chunk) ? 'bn' : 'en';

      fetch(`${API_BASE}/api/media/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk, lang: lang })
      })
      .then(res => res.ok ? res.blob() : Promise.reject())
      .then(blob => {
        if (this.currentMedia !== media || this.ttsRenderId !== currentRenderId) return;
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        this.currentAudio = audio;
        let hasProgressed = false;
        audio.onended = () => {
          if (hasProgressed) return;
          hasProgressed = true;
          this.currentAudio = null;
          sentenceIndex++;

          let pauseTime = 400 + Math.random() * 400;
          if (chunk.endsWith('.') || chunk.endsWith('।')) pauseTime += 400;

          setTimeout(() => {
            URL.revokeObjectURL(audioUrl);
            speakNext();
          }, pauseTime);
        };
        audio.onerror = () => {
          if (hasProgressed) return;
          hasProgressed = true;
          this.currentAudio = null;
          sentenceIndex++;
          setTimeout(() => { URL.revokeObjectURL(audioUrl); speakNext(); }, 50);
        };
        audio.play().catch(() => {
          if (hasProgressed) return;
          hasProgressed = true;
          this.showMuteIndicator();
          this.currentAudio = null;
          const waitTime = Math.max(2000, (chunk.split(/\s+/).length / 2.5) * 1000);
          sentenceIndex++;
          setTimeout(() => { URL.revokeObjectURL(audioUrl); speakNext(); }, waitTime);
        });
      })
      .catch(() => {
        if (this.currentMedia !== media || this.ttsRenderId !== currentRenderId) return;
        sentenceIndex++;
        setTimeout(speakNext, 2000);
      });
    };

    speakNext();
  }

  stopSpeech() {
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        console.error('Error cancelling speech synthesis:', e);
      }
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.removeAttribute('src');
      this.currentAudio.load();
      this.currentAudio = null;
    }
  }

  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('deviceId');
    const name = params.get('name') || params.get('deviceName');
    if (id) {
      this.deviceId = id;
      safeStorage.setItem('deviceId', id);
    }
    if (name) {
      this.deviceName = name;
      safeStorage.setItem('deviceName', name);
    }
  }

  showPairing() {
    this.regEl.style.display = 'flex';
    const instructionsEl = document.getElementById('pair-instructions');
    const titleEl = document.getElementById('pair-title');
    const pairGroup = document.getElementById('pair-input-group');
    const repairGroup = document.getElementById('repair-code-group');
    const submitBtn = document.getElementById('pair-submit');
    const statusEl = document.getElementById('pair-status');
    const pairInput = document.getElementById('pair-code-input');
    const repairInput = document.getElementById('repair-code-input');
    const modeToggle = document.getElementById('pair-mode-toggle');
    
    let isRepairMode = false;
    
    const resetUI = () => {
      instructionsEl.textContent = 'Ask your admin for a pairing code, then enter it below.';
      titleEl.textContent = 'Pair Device';
      pairGroup.style.display = 'block';
      repairGroup.style.display = 'none';
      submitBtn.style.display = 'block';
      submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1; font-size: 18px; vertical-align: middle; margin-right: 8px;">link</span>Confirm Pairing';
      statusEl.className = 'status';
      statusEl.style.display = 'none';
      modeToggle.textContent = 'Re-pair with repair code';
      modeToggle.style.display = 'inline';
      isRepairMode = false;
      pairInput.value = '';
      repairInput.value = '';
    };
    
    const toggleMode = () => {
      isRepairMode = !isRepairMode;
      if (isRepairMode) {
        titleEl.textContent = 'Re-pair Device';
        instructionsEl.textContent = 'Enter the repair code from the CMS admin panel.';
        pairGroup.style.display = 'none';
        repairGroup.style.display = 'block';
        submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1; font-size: 18px; vertical-align: middle; margin-right: 8px;">refresh</span>Confirm Repair';
        modeToggle.textContent = 'Pair with new code';
        repairInput.focus();
      } else {
        resetUI();
        pairInput.focus();
      }
    };
    
    const doPair = async (code, endpoint) => {
      await this.doPair(code, endpoint);
    };
    
    const submitPair = async () => {
      const code = pairInput.value.trim().replace(/\D/g, '');
      if (code.length !== 6) {
        statusEl.className = 'status error';
        statusEl.textContent = 'Please enter a valid 6-digit pairing code.';
        statusEl.style.display = 'block';
        return;
      }
      await doPair(code, '/pair/confirm');
    };
    
    const submitRepair = async () => {
      const code = repairInput.value.trim().replace(/\D/g, '');
      if (code.length !== 6) {
        statusEl.className = 'status error';
        statusEl.textContent = 'Please enter a valid 6-digit repair code.';
        statusEl.style.display = 'block';
        return;
      }
      await doPair(code, '/repair/confirm');
    };
    
    const submit = () => {
      if (isRepairMode) {
        submitRepair();
      } else {
        submitPair();
      }
    };
    
    resetUI();
    pairInput.focus();
    
    submitBtn.onclick = submit;
    pairInput.onkeydown = (e) => { if (e.key === 'Enter') submitPair(); };
    repairInput.onkeydown = (e) => { if (e.key === 'Enter') submitRepair(); };
    modeToggle.onclick = (e) => { e.preventDefault(); toggleMode(); };
  }

  hideRegistration() {
    this.regEl.style.display = 'none';
  }

  handleDeviceNotFound() {
    console.warn('Device not found on server — clearing credentials and showing pairing');
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    // Stop any playing media
    this.stopCurrentMedia();
    this.stopPlaybackGuard();
    // Clear credentials
    safeStorage.removeItem('deviceId');
    safeStorage.removeItem('deviceToken');
    safeStorage.removeItem('deviceName');
    safeStorage.removeItem('subcenterName');
    this.deviceId = null;
    this.deviceToken = null;
    this.deviceName = null;
    this.subcenterName = null;
    this.schedule = [];
    this.playlist = [];
    this.currentIndex = 0;
    // Hide device info
    this.hideDeviceInfo();
    // Show pairing screen
    this.showPairing();
  }

  showDeviceInfo() {
    const el = document.getElementById('device-info');
    const subcenterEl = document.getElementById('device-info-subcenter');
    if (el && subcenterEl) {
      subcenterEl.textContent = this.subcenterName || 'Unknown Location';
      el.classList.add('visible');
    }
    const repairBtn = document.getElementById('device-info-repair');
    if (repairBtn) {
      repairBtn.onclick = () => this.startRePair();
    }
  }

  hideDeviceInfo() {
    const el = document.getElementById('device-info');
    if (el) el.classList.remove('visible');
  }

  startRePair() {
    this.hideDeviceInfo();
    this.showPairingRepair();
  }

  showPairingRepair() {
    this.regEl.style.display = 'flex';
    const instructionsEl = document.getElementById('pair-instructions');
    const titleEl = document.getElementById('pair-title');
    const pairGroup = document.getElementById('pair-input-group');
    const repairGroup = document.getElementById('repair-code-group');
    const submitBtn = document.getElementById('pair-submit');
    const statusEl = document.getElementById('pair-status');
    const modeToggle = document.getElementById('pair-mode-toggle');
    const repairInput = document.getElementById('repair-code-input');

    titleEl.textContent = 'Re-pair Device';
    instructionsEl.textContent = 'Enter the repair code from the CMS admin panel.';
    pairGroup.style.display = 'none';
    repairGroup.style.display = 'block';
    submitBtn.style.display = 'block';
    submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1; font-size: 18px; vertical-align: middle; margin-right: 8px;">refresh</span>Confirm Repair';
    statusEl.className = 'status';
    statusEl.style.display = 'none';
    modeToggle.textContent = 'Pair with new code';
    modeToggle.style.display = 'inline';
    repairInput.value = '';
    repairInput.focus();

    // Re-bind submit to repair mode
    submitBtn.onclick = () => {
      const code = repairInput.value.trim();
      if (code.length !== 6) {
        statusEl.className = 'status error';
        statusEl.textContent = 'Please enter a valid 6-digit repair code.';
        statusEl.style.display = 'block';
        return;
      }
      this.doPair(code, '/repair/confirm');
    };

    modeToggle.onclick = (e) => {
      e.preventDefault();
      this.showPairing();
    };
  }

  async doPair(code, endpoint) {
    const statusEl = document.getElementById('pair-status');
    const tryEndpoint = async (ep) => {
      const res = await fetch(`${API_BASE}/api/devices${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      return { ok: res.ok, status: res.status, data: await res.json() };
    };

    try {
      let result = await tryEndpoint(endpoint);
      // If repair code not found, try pairing code (and vice versa)
      if (!result.ok && result.status === 404 && result.data.error && result.data.error.includes('Invalid or expired')) {
        const fallbackEndpoint = endpoint === '/repair/confirm' ? '/pair/confirm' : '/repair/confirm';
        result = await tryEndpoint(fallbackEndpoint);
      }

      if (result.ok && result.data.status === 'paired') {
        this.deviceId = result.data.deviceId;
        this.deviceToken = result.data.token;
        this.deviceName = result.data.name;
        this.subcenterName = result.data.subcenterName || null;
        safeStorage.setItem('deviceId', result.data.deviceId);
        safeStorage.setItem('deviceToken', result.data.token);
        safeStorage.setItem('deviceName', result.data.name);
        safeStorage.setItem('subcenterName', result.data.subcenterName || '');
        this.hideRegistration();
        this.showDeviceInfo();
        this.setupKioskMode();
        this.setupFullscreen();
        this.setupWakeLock();
        this.connectSocket();
        this.startHeartbeat();
        await this.fetchSchedule();
        this.startPlayback();
      } else {
        if (statusEl) {
          statusEl.className = 'status error';
          statusEl.textContent = result.data.error || 'Invalid code.';
          statusEl.style.display = 'block';
        }
      }
    } catch (e) {
      if (statusEl) {
        statusEl.className = 'status error';
        statusEl.textContent = 'Network error. Please try again.';
        statusEl.style.display = 'block';
      }
    }
  }

  async fetchDeviceInfo() {
    try {
      const res = await fetch(`${API_BASE}/api/devices/${this.deviceId}/info`, {
        headers: {
          'Authorization': `Bearer ${this.deviceToken}`,
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
      if (res.status === 404) {
        console.warn('Device info returned 404 — device no longer exists');
        this.handleDeviceNotFound();
        return false;
      }
      if (res.ok) {
        const data = await res.json();
        this.subcenterName = data.subcenterName || null;
        if (this.subcenterName) {
          safeStorage.setItem('subcenterName', this.subcenterName);
        }
        this.showDeviceInfo();
        return true;
      }
    } catch (e) {
      console.warn('Failed to fetch device info', e);
      // Fallback: try to show from cached storage
      this.showDeviceInfo();
    }
    return false;
  }

  async initCache() {
    if ('caches' in window) {
      try {
        this.cache = await caches.open(CACHE_NAME);
      } catch (e) {
        console.warn('Cache API unavailable:', e);
      }
    }
  }

  setupKioskMode() {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.metaKey && e.key === 'r')) {
        e.preventDefault();
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
      }
      if (e.key === 'F11' || e.key === 'Escape') {
        e.preventDefault();
      }
    }, true);
    window.history.pushState(null, '', window.location.href);
    window.onpopstate = () => {
      window.history.pushState(null, '', window.location.href);
    };
  }

  setupFullscreen() {
    const requestFs = () => {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => { });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) el.msRequestFullscreen();
    };
    document.addEventListener('click', requestFs);
    document.addEventListener('touchstart', requestFs);
  }

  // Try to unlock audio context using getUserMedia (TV kiosk mode workaround)
  async unlockAudio() {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        console.log('Audio context unlocked via getUserMedia');
      }
    } catch (e) {
      // getUserMedia not available or denied — fallback to interaction-based unlock
    }
    // Also try to resume Web Audio if available
    if (window.AudioContext || window.webkitAudioContext) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch {}
      }
    }
  }

  // Try to unmute video after user interaction
  async tryUnmute() {
    if (!this.videoEl.muted) return;
    try {
      this.videoEl.muted = false;
      await this.videoEl.play();
    } catch (e) {
      this.videoEl.muted = true;
    }
  }

  showMuteIndicator() {
    const indicator = document.getElementById('mute-indicator');
    if (indicator) indicator.classList.add('visible');
  }

  hideMuteIndicator() {
    const indicator = document.getElementById('mute-indicator');
    if (indicator) indicator.classList.remove('visible');
  }

  // Enable sound on first user interaction
  enableSoundOnInteraction() {
    const enableAudio = async () => {
      if (this.videoEl && this.videoEl.muted) {
        await this.tryUnmute();
      }
      if (window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
        try {
          const unlockUtterance = new SpeechSynthesisUtterance('');
          unlockUtterance.volume = 0;
          window.speechSynthesis.speak(unlockUtterance);
        } catch (e) {
          console.warn('SpeechSynthesis unlock failed:', e);
        }
      }
      document.removeEventListener('click', enableAudio);
      document.removeEventListener('keydown', enableAudio);
      document.removeEventListener('touchstart', enableAudio);
    };
    document.addEventListener('click', enableAudio);
    document.addEventListener('keydown', enableAudio);
    document.addEventListener('touchstart', enableAudio);
  }

  async setupWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.warn('Wake lock failed:', err);
      }
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
          try {
            this.wakeLock = await navigator.wakeLock.request('screen');
          } catch (err) {
            console.warn('Wake lock re-request failed:', err);
          }
        }
      });
    }
  }

  connectSocket() {
    if (typeof io === 'undefined') {
      console.error('Socket.io not loaded');
      setTimeout(() => this.connectSocket(), 5000);
      return;
    }
    this.socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling']
    });
    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.socket.emit('register', { deviceId: this.deviceId, deviceName: this.deviceName, token: this.deviceToken });
      this.offlineMode = false;
    });
    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.offlineMode = true;
    });
    this.socket.on('connect_error', () => {
      this.offlineMode = true;
    });
    this.socket.on('PLAY_OVERRIDE', (data) => {
      console.log('PLAY_OVERRIDE', data);
      const currentId = this.currentMedia ? (this.currentMedia.mediaId || this.currentMedia.id) : undefined;
      if (currentId && data.mediaId === currentId && this.isOverrideActive) {
        console.log('PLAY_OVERRIDE: same media already playing, ignoring');
        return;
      }
      this.overrideMedia = { ...data, type: this.inferMediaType(data.url), url: this.rewriteLocalhostUrl(data.url) };
      this.isOverrideActive = true;
      this.restartPlayback();
    });
    this.socket.on('RESUME_SCHEDULE', () => {
      console.log('RESUME_SCHEDULE');
      this.isOverrideActive = false;
      this.overrideMedia = null;
      this.restartPlayback();
    });
    this.socket.on('SYNC_CONTENT', () => {
      console.log('SYNC_CONTENT');
      this.fetchSchedule().then(() => this.restartPlayback());
    });
  }

  rewriteLocalhostUrl(url) {
    if (!url) return url
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return url
    return url.replace(/http:\/\/localhost(:\d+)?/, (match, port) => {
      return `http://${host}${port || ''}`
    })
  }

  inferMediaType(url) {
    if (!url) return 'image';
    const ext = url.split('.').pop().toLowerCase().split('?')[0];
    if (['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext)) return 'video';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['txt', 'md', 'json'].includes(ext)) return 'text';
    if (['docx'].includes(ext)) return 'docx';
    return 'image';
  }

  preloadNextItem() {
    if (!this.playlist || this.playlist.length < 2) return;
    const nextIndex = (this.currentIndex + 1) % this.playlist.length;
    const next = this.playlist[nextIndex];
    if (next && next.url && !String(next.url).includes('undefined')) {
      // Don't preload videos into Cache API — TVs have limited memory
      // and streaming from network is more efficient than blob-in-memory
      const type = this.inferMediaType(next.url);
      if (type !== 'video') {
        this.cacheUrl(next.url);
      }
    }
  }

  startPlaybackGuard() {
    if (this.playbackGuardInterval) clearInterval(this.playbackGuardInterval);
    this.playbackGuardInterval = setInterval(() => {
      if (!this.currentMedia || this.isOverrideActive) return;
      const active = this.getActivePlaylist();
      const currentId = this.currentMedia.mediaId || this.currentMedia.id;
      const stillValid = active.some(item => (item.mediaId || item.id) === currentId);
      if (!stillValid) {
        console.log('Playback guard: current media no longer in active window, switching');
        this.nextItem();
      }
    }, 15000);
  }

  stopPlaybackGuard() {
    if (this.playbackGuardInterval) {
      clearInterval(this.playbackGuardInterval);
      this.playbackGuardInterval = null;
    }
  }

  async fetchSchedule() {
    try {
      const res = await fetch(`${API_BASE}/api/devices/${this.deviceId}/schedule`, {
        headers: {
          'Authorization': `Bearer ${this.deviceToken}`,
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      if (res.status === 401 || res.status === 404) {
        console.warn('Device schedule returned', res.status, '— device not found or unauthorized');
        this.handleDeviceNotFound();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        this.schedule = (Array.isArray(data) ? data : (data.items || [])).map(item => ({
          ...item,
          url: this.rewriteLocalhostUrl(item.url)
        }));
        console.log('Schedule loaded:', this.schedule.length, 'items');
        return;
      }
      console.warn('Device schedule returned', res.status);
    } catch (e) {
      console.warn('Device schedule endpoint failed, trying fallback');
    }
    try {
      const res = await fetch(`${API_BASE}/api/schedules`, {
        headers: { 
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const all = Array.isArray(data) ? data : (data.items || []);
        this.schedule = all
          .filter((s) => s.deviceId === this.deviceId || !s.deviceId)
          .map(item => ({
            ...item,
            url: this.rewriteLocalhostUrl(item.url)
          }));
      } else {
        this.offlineMode = true;
      }
    } catch (e) {
      console.warn('Fallback schedule fetch failed, using cached/local content');
      this.offlineMode = true;
    }
  }

  startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  async sendHeartbeat() {
    try {
      const res = await fetch(`${API_BASE}/api/devices/${this.deviceId}/heartbeat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.deviceToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ timestamp: new Date().toISOString(), online: !this.offlineMode })
      });
      if (res.status === 404) {
        console.warn('Heartbeat returned 404 — device no longer exists');
        this.handleDeviceNotFound();
      }
    } catch (e) {
      console.warn('Heartbeat failed');
    }
  }

  async reportPlayback(event, media, completed = false) {
    if (!media) return;
    try {
      await fetch(`${API_BASE}/api/devices/${this.deviceId}/playback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.deviceToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mediaId: media.mediaId || media.id,
          tier: media.tier || 3,
          event,
          completed,
          timestamp: new Date().toISOString()
        })
      });
    } catch (e) {
      console.warn('Playback report failed');
    }
  }

  isValidMedia(item) {
    if (!item) return false;
    let url = item.url || (item.media && item.media.url) || (item.filename ? `${API_BASE}/uploads/${item.filename}` : null) || (item.media && item.media.filename ? `${API_BASE}/uploads/${item.media.filename}` : null);
    // Handle relative URLs
    if (url && url.startsWith('/uploads/')) {
      url = `${API_BASE}${url}`;
    }
    return url && !String(url).includes('undefined');
  }

  isValidDate(item, now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (item.startDate) {
      const start = new Date(item.startDate);
      const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      if (startDateOnly > today) return false;
    }
    if (item.endDate) {
      const end = new Date(item.endDate);
      const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      if (endDateOnly < today) return false;
    }
    return true;
  }

  isValidTime(item, now) {
    if (item.startTime || item.endTime) {
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentMinsTotal = currentHours * 60 + currentMinutes;

      if (item.startTime && item.startTime.includes(':')) {
        const [sh, sm] = item.startTime.split(':').map(Number);
        if (sh * 60 + sm > currentMinsTotal) return false;
      }
      if (item.endTime && item.endTime.includes(':')) {
        const [eh, em] = item.endTime.split(':').map(Number);
        if (eh * 60 + em < currentMinsTotal) return false;
      }
    }
    return true;
  }

  getActivePlaylist() {
    if (this.isOverrideActive && this.overrideMedia) {
      if (this.isValidMedia(this.overrideMedia)) {
        return [this.overrideMedia];
      }
      return [];
    }
    const now = new Date();
    // Check for TIER_1 scheduled content
    const tier1 = (this.schedule || []).filter((item) => {
      if (!this.isValidMedia(item)) return false;
      const tier = item.tier ? item.tier.toString().toUpperCase() : '';
      if (tier && tier !== 'TIER_1' && tier !== 'OVERRIDE') return false;
      if (!this.isValidDate(item, now)) return false;
      if (!this.isValidTime(item, now)) return false;
      return true;
    });
    if (tier1.length > 0) return tier1;
    // Check for TIER_2 scheduled content
    const tier2 = (this.schedule || []).filter((item) => {
      if (!this.isValidMedia(item)) return false;
      const tier = item.tier ? item.tier.toString().toUpperCase() : '';
      if (tier && tier !== 'TIER_2') return false;
      if (!this.isValidDate(item, now)) return false;
      if (!this.isValidTime(item, now)) return false;
      return true;
    });
    if (tier2.length > 0) return tier2;
    // Check for TIER_3 scheduled content
    const tier3 = (this.schedule || []).filter((item) => {
      if (!this.isValidMedia(item)) return false;
      const tier = item.tier ? item.tier.toString().toUpperCase() : '';
      if (tier && tier !== 'TIER_3') return false;
      if (!this.isValidDate(item, now)) return false;
      if (!this.isValidTime(item, now)) return false;
      return true;
    });
    if (tier3.length > 0) return tier3;
    // Fallback to local playlist
    const localPlaylist = JSON.parse(safeStorage.getItem('localPlaylist') || '[]');
    const validLocal = localPlaylist
      .filter((item) => this.isValidMedia(item))
      .map((item) => ({ ...item, tier: item.tier || 'TIER_3' }));
    if (validLocal.length > 0) {
      return validLocal;
    }
    return [];
  }

  restartPlayback() {
    this.currentIndex = 0;
    this.stopCurrentMedia();
    this.stopPlaybackGuard();
    this.startPlayback();
  }

  showScheduleInfo(media) {
    const metaEl = document.getElementById('schedule-meta');
    const titleEl = document.getElementById('schedule-title');
    const infoEl = document.getElementById('schedule-info');
    if (!metaEl || !titleEl || !infoEl) return;

    const categoryName = media.categoryName || '';
    const contentTypeName = media.contentTypeName || '';
    const contentName = media.contentName || '';

    const hierarchy = [categoryName, contentTypeName].filter(Boolean).join(' → ');
    metaEl.textContent = hierarchy || 'Digital Signage System';
    titleEl.textContent = contentName || media.filename || 'Now Playing';
    infoEl.classList.add('visible');
  }

  hideScheduleInfo() {
    const infoEl = document.getElementById('schedule-info');
    if (infoEl) infoEl.classList.remove('visible');
  }

  stopCurrentMedia(fullReset = true) {
    if (this.imageTimer) {
      clearTimeout(this.imageTimer);
      this.imageTimer = null;
    }
    this.stopSpeech();
    this.hideScheduleInfo();

    if (fullReset) {
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
      this.videoEl.style.display = 'none';
      this.videoEl.currentTime = 0;
      this.videoEl.playbackRate = 1;
      if (this.videoStallTimer) {
        clearTimeout(this.videoStallTimer);
        this.videoStallTimer = null;
      }
      this.imgEl.style.display = 'none';
      this.pdfEl.style.display = 'none';
      this.textContainerEl.style.display = 'none';
      this.imgEl.src = '';
    } else {
      // Soft stop: just pause video but keep element visible for same-type transition
      this.videoEl.pause();
    }

    // Reset monolith layout
    if (this.ghostPrevEl) this.ghostPrevEl.innerText = '';
    if (this.activeSentenceEl) {
      this.activeSentenceEl.innerText = '';
      this.activeSentenceEl.classList.remove('is-exiting', 'is-entering');
    }
    if (this.ghostNextEl) this.ghostNextEl.innerText = '';
    this.readingProgressEl.style.width = '0%';

    if (this.currentMedia && this.mediaStartTime) {
      const isVideo = this.currentMedia.type === 'video';
      this.reportPlayback('ended', this.currentMedia, !isVideo);
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.currentMedia = null;
  }

  async startPlayback() {
    this.playlist = this.getActivePlaylist();
    console.log('Active playlist:', this.playlist.length, 'items');
    // Filter out invalid items
    this.playlist = this.playlist.filter(item => {
      const hasUrl = item.url || item.filename;
      return hasUrl && !String(item.url).includes('undefined');
    });

    if (this.playlist.length === 0) {
      console.log('No active content — retrying in 10s');
      this.showNoContent();
      this.stopPlaybackGuard();
      if (!this.isPlaying) {
        this.isPlaying = true;
      }
      setTimeout(() => this.startPlayback(), 10000);
      return;
    }

    // Reset index if out of bounds
    if (this.currentIndex >= this.playlist.length) {
      this.currentIndex = 0;
    }

    this.isPlaying = true;
    this.noContentEl.style.display = 'none';
    await this.playItem(this.playlist[this.currentIndex]);
  }

  async playItem(media) {
    if (!media) return;

    // Validate media has required fields
    let url = media.url || (media.media && media.media.url) || (media.filename ? `${API_BASE}/uploads/${media.filename}` : null) || (media.media && media.media.filename ? `${API_BASE}/uploads/${media.media.filename}` : null);
    // Fix relative URLs - ensure they point to the backend
    if (url && url.startsWith('/uploads/')) {
      url = `${API_BASE}${url}`;
    }
    if (!url || url.includes('undefined')) {
      console.error('Invalid media - missing URL:', media);
      this.consecutiveErrors++;
      setTimeout(() => this.nextItem(), 1000);
      return;
    }

    media.type = this.inferMediaType(url);

    // Smart transition: same type = soft stop (no black flash between videos/images)
    const prevMedia = this.currentMedia;
    const isSameType = prevMedia && prevMedia.type === media.type;
    if (isSameType) {
      this.stopCurrentMedia(false); // soft stop
    } else {
      this.stopCurrentMedia(true);  // full reset
    }

    this.currentMedia = media;
    this.mediaStartTime = Date.now();
    this.showScheduleInfo(media);
    this.reportPlayback('started', media);

    let playUrl = url;

    // Check if we've had too many consecutive errors
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      console.warn('Too many consecutive errors, refreshing schedule...');
      this.consecutiveErrors = 0;
      await this.fetchSchedule();
      setTimeout(() => this.startPlayback(), 5000);
      return;
    }

    // For videos, stream directly from network URL.
    // Loading entire video into a memory blob overwhelms TV browsers.
    const isVideo = media.type === 'video';
    if (!isVideo) {
      const cachedResponse = await this.getCachedResponse(url);
      if (cachedResponse) {
        try {
          const blob = await cachedResponse.blob();
          playUrl = URL.createObjectURL(blob);
          this.currentObjectUrl = playUrl;
        } catch (e) {
          console.warn('Failed to create object URL from cache');
        }
      } else {
        this.cacheUrl(url);
      }
    }

    if (isVideo) {
      this.videoEl.style.display = 'block';

      // Reset video state for clean playback between videos
      this.videoEl.pause();
      this.videoEl.currentTime = 0;
      this.videoEl.playbackRate = 1;
      this.videoEl.defaultPlaybackRate = 1;

      // Clear any stale stall timer
      if (this.videoStallTimer) {
        clearTimeout(this.videoStallTimer);
        this.videoStallTimer = null;
      }

      // Setup event handlers BEFORE setting src
      this.videoEl.onended = () => {
        this.consecutiveErrors = 0;
        if (this.videoStallTimer) { clearTimeout(this.videoStallTimer); this.videoStallTimer = null; }
        this.reportPlayback('ended', media, true);
        this.nextItem();
      };

      this.videoEl.onerror = () => {
        console.error('Video playback error:', url);
        if (this.videoStallTimer) { clearTimeout(this.videoStallTimer); this.videoStallTimer = null; }
        this.consecutiveErrors++;
        this.reportPlayback('ended', media, false);
        setTimeout(() => this.nextItem(), 1000);
      };

      // TV stall recovery: if video stops buffering, skip after timeout
      this.videoEl.onwaiting = () => {
        console.log('Video buffering...');
        if (this.videoStallTimer) clearTimeout(this.videoStallTimer);
        this.videoStallTimer = setTimeout(() => {
          console.warn('Video stalled too long, skipping to next');
          this.consecutiveErrors++;
          this.reportPlayback('ended', media, false);
          this.nextItem();
        }, 15000);
      };

      this.videoEl.onplaying = () => {
        if (this.videoStallTimer) { clearTimeout(this.videoStallTimer); this.videoStallTimer = null; }
        console.log('Video playing');
      };

      this.videoEl.onstalled = () => {
        console.warn('Video network stalled');
        if (this.videoStallTimer) clearTimeout(this.videoStallTimer);
        this.videoStallTimer = setTimeout(() => {
          console.warn('Video stalled too long, skipping to next');
          this.consecutiveErrors++;
          this.reportPlayback('ended', media, false);
          this.nextItem();
        }, 15000);
      };

      this.videoEl.src = playUrl;
      this.videoEl.load();

      // Wait for enough data before playing — critical for smooth TV playback
      let canPlayFired = false;
      const tryPlay = async () => {
        if (canPlayFired) return;
        canPlayFired = true;
        this.videoEl.oncanplaythrough = null;
        try {
          this.videoEl.muted = false;
          await this.videoEl.play();
          this.consecutiveErrors = 0;
        } catch (e) {
          try {
            this.videoEl.muted = true;
            await this.videoEl.play();
            this.consecutiveErrors = 0;
            this.tryUnmute();
          } catch (muteErr) {
            console.error('Video play failed:', muteErr);
            this.consecutiveErrors++;
            this.reportPlayback('ended', media, false);
            setTimeout(() => this.nextItem(), 1000);
          }
        }
      };

      if (this.videoEl.readyState >= 4) {
        tryPlay();
      } else {
        this.videoEl.oncanplaythrough = tryPlay;
        // Fallback: if canplaythrough never fires, try after 3s
        setTimeout(() => {
          if (!canPlayFired) {
            this.videoEl.oncanplaythrough = null;
            tryPlay();
          }
        }, 3000);
      }
    } else if (media.type === 'pdf') {
      this.playPdf(playUrl, media);
    } else if (media.type === 'docx') {
      this.playDocx(playUrl, media);
    } else if (media.type === 'text') {
      this.playText(playUrl, media);
    } else {
      this.imgEl.style.display = 'block';
      this.imgEl.src = playUrl;
      this.imgEl.onload = () => {
        this.consecutiveErrors = 0;
      };
      this.imgEl.onerror = () => {
        console.error('Image load error:', url);
        this.consecutiveErrors++;
        this.reportPlayback('ended', media, false);
        setTimeout(() => this.nextItem(), 1000);
      };
      this.imageTimer = setTimeout(() => {
        this.consecutiveErrors = 0;
        this.reportPlayback('ended', media, true);
        this.nextItem();
      }, IMAGE_DURATION_MS);
    }

    // Preload next item and ensure playback guard is running
    this.preloadNextItem();
    this.startPlaybackGuard();
  }

  async playPdf(url, media) {
    this.textContainerEl.style.display = 'flex';
    this.ghostPrevEl.innerText = '';
    this.ghostNextEl.innerText = '';
    this.activeSentenceEl.innerHTML = `
      <div class="premium-loader">
        <div class="loader-icon">✨</div>
        <h3>Narrating via AI</h3>
        <p>Transforming document content into a professional storytelling experience...</p>
      </div>
    `;
    
    try {
      const res = await fetch(`${API_BASE}/api/media/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: media.mediaId || media.id })
      });

      if (!res.ok) {
        console.warn(`Narrative fetch ${res.status} for media ${media.id} — removing from session.`);
        this.schedule = this.schedule.filter(item => (item.mediaId || item.id) !== media.id);
        this.playlist = this.playlist.filter(item => (item.mediaId || item.id) !== media.id);
        this.reportPlayback('ended', media, false);
        setTimeout(() => this.nextItem(), 2000);
        return;
      }

      const data = await res.json();
      if (!data.text) {
        console.warn(`Narrative empty for media ${media.id} — removing from session.`);
        this.schedule = this.schedule.filter(item => (item.mediaId || item.id) !== media.id);
        this.playlist = this.playlist.filter(item => (item.mediaId || item.id) !== media.id);
        this.reportPlayback('ended', media, false);
        setTimeout(() => this.nextItem(), 2000);
        return;
      }
      if (this.currentMedia === media) {
        this.renderTextAsBook(data.text, media);
      }
    } catch (e) {
      console.error('Narrative error:', e);
      this.consecutiveErrors++;
      this.reportPlayback('ended', media, false);
      setTimeout(() => this.nextItem(), 1000);
    }
  }

  async playText(url, media) {
    this.textContainerEl.style.display = 'flex';
    this.ghostPrevEl.innerText = '';
    this.ghostNextEl.innerText = '';
    this.activeSentenceEl.innerHTML = `
      <div class="premium-loader">
        <div class="loader-icon">📚</div>
        <h3>Opening the book</h3>
        <p>AI is crafting a professional narration for this content...</p>
      </div>
    `;
    
    try {
      const res = await fetch(`${API_BASE}/api/media/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: media.mediaId || media.id })
      });

      if (!res.ok) {
        console.warn(`Narrative fetch ${res.status} for media ${media.id} — removing from session.`);
        this.schedule = this.schedule.filter(item => (item.mediaId || item.id) !== media.id);
        this.playlist = this.playlist.filter(item => (item.mediaId || item.id) !== media.id);
        this.reportPlayback('ended', media, false);
        setTimeout(() => this.nextItem(), 2000);
        return;
      }

      const data = await res.json();
      if (!data.text) {
        console.warn(`Narrative empty for media ${media.id} — removing from session.`);
        this.schedule = this.schedule.filter(item => (item.mediaId || item.id) !== media.id);
        this.playlist = this.playlist.filter(item => (item.mediaId || item.id) !== media.id);
        this.reportPlayback('ended', media, false);
        setTimeout(() => this.nextItem(), 2000);
        return;
      }
      if (this.currentMedia === media) {
        this.renderTextAsBook(data.text, media);
      }
    } catch (e) {
      console.error('Narrative error:', e);
      this.consecutiveErrors++;
      this.reportPlayback('ended', media, false);
      setTimeout(() => this.nextItem(), 1000);
    }
  }

  async playDocx(url, media) {
    this.textContainerEl.style.display = 'flex';
    this.ghostPrevEl.innerText = '';
    this.ghostNextEl.innerText = '';
    this.activeSentenceEl.innerHTML = `
      <div class="premium-loader">
        <div class="loader-icon">📖</div>
        <h3>Curating narrative</h3>
        <p>Polishing the text and preparing a professional audiobook script...</p>
      </div>
    `;
    
    try {
      const res = await fetch(`${API_BASE}/api/media/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: media.mediaId || media.id })
      });

      if (!res.ok) {
        console.warn(`Narrative fetch failed with status ${res.status} for media ${media.id} — removing from session.`);
        this.schedule = this.schedule.filter(item => (item.mediaId || item.id) !== media.id);
        this.playlist = this.playlist.filter(item => (item.mediaId || item.id) !== media.id);
        this.reportPlayback('ended', media, false);
        setTimeout(() => this.nextItem(), 2000);
        return;
      }

      const data = await res.json();
      if (!data.text) {
        console.warn(`Narrative empty for media ${media.id} — removing from session.`);
        this.schedule = this.schedule.filter(item => (item.mediaId || item.id) !== media.id);
        this.playlist = this.playlist.filter(item => (item.mediaId || item.id) !== media.id);
        this.reportPlayback('ended', media, false);
        setTimeout(() => this.nextItem(), 2000);
        return;
      }
      if (this.currentMedia === media) {
        this.renderTextAsBook(data.text, media);
      }
    } catch (e) {
      console.error('Narrative error:', e);
      this.consecutiveErrors++;
      this.reportPlayback('ended', media, false);
      setTimeout(() => this.nextItem(), 1000);
    }
  }

  nextItem() {
    if (this.isOverrideActive && this.overrideMedia) {
      this.playlist = [this.overrideMedia];
      this.currentIndex = 0;
    } else {
      const fresh = this.getActivePlaylist();
      if (fresh.length > 0) {
        const changed = fresh.length !== this.playlist.length ||
          JSON.stringify(fresh[0]) !== JSON.stringify(this.playlist[0]);
        if (changed) {
          this.playlist = fresh;
          this.currentIndex = 0;
        } else {
          this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        }
      } else {
        this.playlist = [];
        this.currentIndex = 0;
      }
    }
    if (this.playlist.length === 0) {
      this.startPlayback();
    } else {
      this.playItem(this.playlist[this.currentIndex]);
    }
  }

  showNoContent() {
    this.videoEl.style.display = 'none';
    this.imgEl.style.display = 'none';
    this.hideScheduleInfo();
    this.noContentEl.style.display = 'flex';
  }

  async getCachedResponse(url) {
    if (!this.cache) return null;
    try {
      const req = new Request(url, { mode: 'cors' });
      return await this.cache.match(req);
    } catch (e) {
      return null;
    }
  }

  async cacheUrl(url) {
    if (!this.cache) return;
    // Skip caching videos — they are too large for TV browser Cache API
    if (this.inferMediaType(url) === 'video') return;
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) {
        const req = new Request(url, { mode: 'cors' });
        await this.cache.put(req, res.clone());
      }
    } catch (e) {
      console.warn('Cache write failed:', e);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new TVPlayer();
});
