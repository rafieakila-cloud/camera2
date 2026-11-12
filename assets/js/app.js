/* Camera2 — kamera pintar untuk semua orang
   Developer: bawapi-katak
   Semua proses di perangkat. Tidak mengirim data ke mana pun. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const video = $('#video');
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

const state = {
  stream: null,
  facing: 'environment',   // environment | user
  mirror: false,
  zoom: 1,
  aspect: '4:3',
  filter: 'none',
  brightness: 100,
  contrast: 100,
  timer: 0,
  grid: false,
  level: false,
  watermark: true,
  recording: false,
  recorder: null,
  chunks: [],
  gallery: []              // dataURLs
};
const MAX_GALLERY = 8;
const FILTERS = {
  none:   { css: 'none',                                  ctx: 'none',                                name: 'Normal' },
  bnw:    { css: 'grayscale(1)',                          ctx: 'grayscale(100%)',                     name: 'B&W' },
  sepia:  { css: 'sepia(.8) contrast(1.05) brightness(.95)', ctx: 'sepia(80%) contrast(105%) brightness(95%)', name: 'Sepia' },
  golden: { css: 'sepia(.45) saturate(1.6) contrast(1.05)', ctx: 'sepia(45%) saturate(160%) contrast(105%)',  name: 'Golden' },
  neon:   { css: 'saturate(2.2) contrast(1.25)',         ctx: 'saturate(220%) contrast(125%)',        name: 'Neon' }
};

/* ========== Kamera ========== */
async function startCamera() {
  try { stopCamera(); } catch (e) {}
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: state.facing },
      width: { ideal: 1920 }, height: { ideal: 1080 }
    }
  };
  try {
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = state.stream;
    $('#err').classList.remove('show');
    populateResolutions();
  } catch (e) {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = state.stream;
      $('#err').classList.remove('show');
      populateResolutions();
    } catch (e2) {
      $('#err').classList.add('show');
    }
  }
}
function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
}
function currentTrack() {
  return state.stream ? state.stream.getVideoTracks()[0] : null;
}
function populateResolutions() {
  const sel = $('#resSel');
  sel.innerHTML = '';
  const track = currentTrack();
  if (!track) { sel.innerHTML = '<option>Deteksi gagal</option>'; return; }
  const s = track.getSettings();
  sel.innerHTML = `<option value="native">Otomatis (${s.width || '?'}×${s.height || '?'})</option>`;
  [['3840x2160','4K'],['1920x1080','Full HD'],['1280x720','HD'],['640x480','VGA']].forEach(([v,label]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = label;
    sel.appendChild(o);
  });
  sel.addEventListener('change', applyResolution, { once: true });
}
async function applyResolution() {
  const parts = $('#resSel').value.split('x').map(Number);
  if (!parts || parts.length !== 2 || isNaN(parts[0])) return;
  try {
    await currentTrack().applyConstraints({ width: { exact: parts[0] }, height: { exact: parts[1] } });
  } catch (e) { /* mostly unsupported in browsers */ }
}

/* ========== Fungsi bantuan ========== */
function aspect() {
  switch (state.aspect) {
    case '1:1': return 1;
    case '16:9': return 16 / 9;
    default: return 4 / 3;
  }
}
function videoCss() {
  const f = FILTERS[state.filter].css;
  return `brightness(${state.brightness}%) contrast(${state.contrast}%) ${f === 'none' ? '' : f}`;
}
function updatePreview() {
  video.style.transform = `${state.facing === 'user' && state.mirror ? 'scaleX(-1)' : ''} scale(${state.zoom})`;
  video.style.filter = videoCss();
}
function stageAspect() {
  const stage = $('#stage');
  stage.style.aspectRatio = String(aspect());
  stage.style.maxWidth = 'calc(100vh * ' + aspect() + ')';
}

/* ========== Shutter ========== */
function snap() {
  return new Promise(resolve => {
    const track = currentTrack();
    if (!track) return resolve(null);
    const s = track.getSettings();
    const vw = s.width || 1280, vh = s.height || 720;
    const targetAR = aspect();
    let cw = vw, ch = Math.round(vw / targetAR);
    if (ch > vh) { ch = vh; cw = Math.round(vh * targetAR); }
    const sx = (vw - cw) / 2, sy = (vh - ch) / 2;
    canvas.width = cw; canvas.height = ch;
    ctx.save();
    ctx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) ${FILTERS[state.filter].ctx === 'none' ? '' : FILTERS[state.filter].ctx}`;
    if (state.facing === 'user' && state.mirror) {
      ctx.translate(cw, 0); ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch);
    ctx.restore();
    // watermark
    if (state.watermark) {
      ctx.save();
      ctx.fillStyle = 'rgba(232,236,244,0.7)';
      ctx.font = '600 18px "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
      ctx.fillText('CAMERA2 · bawapi-katak', cw - 14, ch - 12);
      ctx.restore();
    }
    resolve(canvas.toDataURL('image/png'));
  });
}
async function takePhoto() {
  if (state.timer > 0) {
    const timerBox = $('#timer'), num = $('#timerNum');
    timerBox.classList.remove('hidden');
    for (let t = state.timer; t > 0; t--) {
      num.textContent = t;
      playBeep(660, 80);
      await new Promise(r => setTimeout(r, 1000));
    }
    timerBox.classList.add('hidden');
  }
  const dataUrl = await snap();
  if (dataUrl) {
    addToGallery(dataUrl);
    doFlash();
  }
}
function doFlash() {
  const f = $('#flash');
  f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
}
function playBeep(freq, ms) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctxAudio = new AC();
    const o = ctxAudio.createOscillator();
    const g = ctxAudio.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, ctxAudio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctxAudio.currentTime + ms / 1000);
    o.connect(g); g.connect(ctxAudio.destination);
    o.start(); o.stop(ctxAudio.currentTime + ms / 1000);
  } catch (e) {}
}
function addToGallery(dataUrl) {
  state.gallery.unshift(dataUrl);
  if (state.gallery.length > MAX_GALLERY) state.gallery.pop();
  renderGallery();
}
function renderGallery() {
  const g = $('#gallery');
  g.innerHTML = state.gallery.map((u, i) => `<img src="${u}" alt="Foto ${i + 1}">`).join('');
  $$('img', g).forEach((img, i) => img.addEventListener('click', () => openBig(state.gallery[i])));
}
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function openBig(dataUrl) { $('#bigImg').src = dataUrl; $('#bigview').classList.add('open'); }
$('#closeBig').addEventListener('click', () => $('#bigview').classList.remove('open'));
$('#bigview').addEventListener('click', (e) => { if (e.target.id === 'bigview') $('#bigview').classList.remove('open'); });

/* ========== Burst ========== */
let burstHolding = false;
$('#burstBtn').addEventListener('pointerdown', () => { burstHolding = true; burstLoop(); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
  $('#burstBtn').addEventListener(ev, () => { burstHolding = false; }));
async function burstLoop() {
  while (burstHolding) {
    await takePhoto();
    await new Promise(r => setTimeout(r, 520));
  }
}

/* ========== Snap & Record ========== */
$('#snap').addEventListener('click', takePhoto);
$('#recBtn').addEventListener('click', async () => {
  if (state.recording) return stopRecording();
  if (!state.stream) return;
  try {
    state.chunks = [];
    state.recorder = new MediaRecorder(state.stream, { mimeType: 'video/webm' });
    state.recorder.ondataavailable = e => { if (e.data.size) state.chunks.push(e.data); };
    state.recorder.onstop = saveRecording;
    state.recorder.start();
    state.recording = true;
    $('#rec').classList.remove('hidden');
  } catch (e) { /* recording unsupported */ alert('Perekaman tidak didukung di browser ini.'); }
});
function stopRecording() {
  try { state.recorder && state.recorder.stop(); } catch (e) {}
  state.recording = false;
  $('#rec').classList.add('hidden');
}
function saveRecording() {
  const blob = new Blob(state.chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Camera2_vlog_${Date.now()}.webm`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ========== UI bindings ========== */
$('#gridBtn').addEventListener('click', () => { state.grid = !state.grid; $('#grid').classList.toggle('on', state.grid); $('#gridBtn').classList.toggle('active', state.grid); });
$('#wmToggle').addEventListener('click', () => { state.watermark = !state.watermark; $('#wm').classList.toggle('hidden', !state.watermark); $('#wmToggle').classList.toggle('active', state.watermark); });
$('#switchCam').addEventListener('click', () => { state.facing = state.facing === 'user' ? 'environment' : 'user'; startCamera(); });
$('#flip').addEventListener('click', () => { state.mirror = !state.mirror; updatePreview(); });
$('#retryCam').addEventListener('click', startCamera);

$('#zoom').addEventListener('input', e => { state.zoom = parseFloat(e.target.value); $('#zoomLbl').textContent = state.zoom.toFixed(1) + '×'; updatePreview(); });
$('#brightness').addEventListener('input', e => { state.brightness = parseInt(e.target.value, 10); updatePreview(); });
$('#contrast').addEventListener('input', e => { state.contrast = parseInt(e.target.value, 10); updatePreview(); });

$$('#aspectSeg button').forEach(b => b.addEventListener('click', () => {
  $$('#aspectSeg button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  state.aspect = b.dataset.aspect;
  stageAspect();
}));
$$('#timerSeg button').forEach(b => b.addEventListener('click', () => {
  $$('#timerSeg button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  state.timer = parseInt(b.dataset.t, 10);
}));
$$('#filterSeg button').forEach(b => b.addEventListener('click', () => {
  $$('#filterSeg button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  state.filter = b.dataset.filter;
  updatePreview();
}));

/* ========== Level (sensor) ========== */
const levelBtn = $('#levelBtn');
let levelSupported = false;
let levelGranted = false;

async function tryEnableLevel() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { levelGranted = (await DeviceOrientationEvent.requestPermission()) === 'granted'; }
    catch (e) { levelGranted = false; }
    return levelGranted;
  }
  return true; // browser non-iOS: no prompt required
}

window.addEventListener('deviceorientation', (e) => {
  levelSupported = true;
  if (!state.level) return;
  const gamma = e.gamma == null ? 0 : e.gamma;
  const abs = Math.abs(gamma);
  $('#level').textContent = (gamma >= 0 ? '+' : '') + gamma.toFixed(1) + '°';
  $('#level').classList.toggle('ok', abs < 2.5);
  const pct = Math.max(-1, Math.min(1, gamma / 30));
  $('#levelDot').style.left = (50 + pct * 44) + '%';
});

levelBtn.addEventListener('click', async () => {
  if (!state.level) {
    const ok = await tryEnableLevel();
    if (!ok) {
      levelBtn.setAttribute('title', 'Akses sensor ditolak');
      alert('Akses sensor orientasi ditolak. Aktifkan di Pengaturan situs browsermu.');
      return;
    }
  }
  state.level = !state.level;
  $('#level').classList.toggle('hidden', !state.level);
  $('#levelBar').classList.toggle('hidden', !state.level);
  levelBtn.classList.toggle('active', state.level);
  if (state.level) {
    // jika sensor asli tidak ada, peringatkan jujur
    setTimeout(() => { if (!levelSupported) { $('#level').textContent = 'Sensor tidak tersedia'; $('#level').classList.add('hidden'); } }, 1200);
  }
});

/* ========== Boot ========== */
startCamera();
stageAspect();
updatePreview();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
