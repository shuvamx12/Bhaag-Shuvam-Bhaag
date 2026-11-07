// @ts-nocheck
'use strict';
const $ = id => document.getElementById(id);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

/* ---------- MOMO WALLET + WORLD SHOP ---------- */
const PRICES = { 2: 250 }; // world index -> price in momos (2 = Pokhara)
const cleanInt = v => { v = Math.floor(+v); return isFinite(v) && v > 0 ? v : 0; };
let wallet = cleanInt(LS.get('wallet', 0));
let ownedW = (() => { const a = LS.get('ownedWorlds', []); return Array.isArray(a) ? a.filter(n => Number.isInteger(n)) : []; })();
const isOwned = z => !(z in PRICES) || ownedW.includes(z);
function addMomo(n) { wallet += n; LS.set('wallet', wallet); }
function buyWorld(z) {
  const p = PRICES[z];
  if (p === undefined || isOwned(z) || wallet < p) return false;
  ownedW.push(z); LS.set('ownedWorlds', ownedW);
  wallet -= p; LS.set('wallet', wallet);
  return true;
}

/* ---------- CONFIG: photo + replaceable sounds ---------- */
// FACE crop = fraction of the photo (x, y = top-left, s = width). Adjust if your face is cropped badly.
const FACE = { path: 'https://i.ibb.co/DfNCrmhn/20261102-173054.jpg', x: 0.56, y: 0.25, s: 0.26 };
const SOUND_FILES = {
  jump: 'https://raw.githubusercontent.com/shuvamx12/Audio/main/Jhyaap_Natak_1793948253582993.mp3',coin: 'https://raw.githubusercontent.com/shuvamx12/Audio/main/am-am-am-mellstroy.mp3', crash: 'https://raw.githubusercontent.com/shuvamx12/Audio/main/Jhyaap_Nautanki_1793948506835255-2.mp3',
  surprise: 'assets/sounds/surprise.mp3', laugh: 'assets/sounds/laugh.mp3', win: 'assets/sounds/win.mp3'
};

/* ---------- SOUND MANAGER (synth fallback, files override if found) ---------- */
const Snd = {
  ctx: null, buf: {}, mt: null,
  vol: LS.get('vol', { m: 0.8, mu: 0.4, s: 0.8, mute: false }),
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    this.ctx = new A();
    this.master = this.ctx.createGain(); this.musicG = this.ctx.createGain(); this.sfxG = this.ctx.createGain();
    this.musicG.connect(this.master); this.sfxG.connect(this.master); this.master.connect(this.ctx.destination);
    this.apply();
    for (const k in SOUND_FILES) {
      fetch(SOUND_FILES[k]).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
        .then(b => this.ctx.decodeAudioData(b)).then(d => { this.buf[k] = d; }).catch(() => {});
    }
  },
  apply() {
    const v = this.vol;
    if (this.ctx) { this.master.gain.value = v.mute ? 0 : v.m; this.musicG.gain.value = v.mu; this.sfxG.gain.value = v.s; }
    LS.set('vol', v);
    $('muteBtn').textContent = v.mute ? '🔇' : '🔊';
    $('muteBtn2').textContent = 'MUTE: ' + (v.mute ? 'ON' : 'OFF');
    $('vM').value = v.m; $('vMu').value = v.mu; $('vS').value = v.s;
  },
  tone(f, d, type, sl, delay) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (sl) o.frequency.exponentialRampToValueAtTime(sl, t0 + d);
    g.gain.setValueAtTime(0.4, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
    o.connect(g); g.connect(this.sfxG); o.start(t0); o.stop(t0 + d + 0.02);
  },
  play(n) {
    if (!this.ctx) return;
    if (this.buf[n]) { const s = this.ctx.createBufferSource(); s.buffer = this.buf[n]; s.connect(this.sfxG); s.start(); return; }
    const P = {
      jump: [[300, .15, 'square', 700]], coin: [[880, .08, 'triangle'], [1320, .12, 'triangle']],
      crash: [[220, .5, 'sawtooth', 50]], surprise: [[500, .1, 'square', 900], [900, .1, 'square', 500]],
      laugh: [[400, .08, 'square', 500], [350, .08, 'square', 450], [400, .08, 'square', 500], [350, .12, 'square', 420]],
      win: [[520, .1, 'triangle'], [660, .1, 'triangle'], [780, .2, 'triangle']]
    };
    let t = 0; (P[n] || []).forEach(a => { this.tone(a[0], a[1], a[2], a[3], t); t += a[1] * 0.9; });
  },
  music(on) {
    clearInterval(this.mt); if (!on || !this.ctx) return;
    const notes = [110, 110, 165, 131, 110, 110, 196, 165]; let i = 0;
    this.mt = setInterval(() => {
      if (this.ctx.state !== 'running') return;
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = notes[i % 8] * (Math.floor(i / 8) % 2 ? 1.5 : 1); i++;
      g.gain.setValueAtTime(0.3, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22);
      o.connect(g); g.connect(this.musicG); o.start(); o.stop(c.currentTime + 0.25);
    }, 240);
  }
};

/* ---------- RENDERER / SCENE ---------- */
const lowEnd = /Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
let pr = Math.min(window.devicePixelRatio || 1, lowEnd ? 1.25 : 2);
const SHADOWS = (navigator.hardwareConcurrency || 4) >= 6; // one small shadow map on capable phones/desktops
const R = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !lowEnd, powerPreference: 'high-performance' });
R.setPixelRatio(pr); R.shadowMap.enabled = SHADOWS; R.shadowMap.type = THREE.PCFSoftShadowMap;
R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
const S = new THREE.Scene();
S.background = new THREE.Color(0xf2c9a0); S.fog = new THREE.Fog(0xf2c9a0, 50, 170);
const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
const hemi = new THREE.HemisphereLight(0xfff1dd, 0x6b5a4a, 0.95); S.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b8, 0.9);
sun.castShadow = SHADOWS; sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 30, bottom: -30, near: 1, far: 70 });
sun.shadow.camera.updateProjectionMatrix(); // BUGFIX: bounds were never applied before
S.add(sun, sun.target);
function resize() {
  R.setSize(innerWidth, innerHeight, false);
  cam.aspect = innerWidth / innerHeight; cam.fov = cam.aspect < 1 ? 75 : 60; cam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const MC = {};
const ENVMATS = []; let envTex = null; // materials that receive the sky reflection map
const mat = c => MC[c] || (MC[c] = (() => {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.08, envMapIntensity: 0.6 });
  m.color.setHex(c).convertSRGBToLinear(); if (envTex) m.envMap = envTex; ENVMATS.push(m); return m;
})());
const BG = new THREE.BoxGeometry(1, 1, 1), SG = new THREE.SphereGeometry(0.5, 12, 10), CG = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
function part(g, c, w, h, d, x, y, z, parent) {
  const m = new THREE.Mesh(g, mat(c)); m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = SHADOWS; parent.add(m); return m;
}
const B = (...a) => part(BG, ...a), Sp = (...a) => part(SG, ...a), Cy = (...a) => part(CG, ...a);

/* ---------- FACE TEXTURE (from your photo) ---------- */
const fc = document.createElement('canvas'); fc.width = fc.height = 256;
const fx = fc.getContext('2d');
const faceTex = new THREE.CanvasTexture(fc); faceTex.encoding = THREE.sRGBEncoding;
function drawPrev() {
  const p = $('prev').getContext('2d'); p.clearRect(0, 0, 160, 160);
  p.save(); p.beginPath(); p.arc(80, 80, 80, 0, 7); p.clip(); p.drawImage(fc, 0, 0, 160, 160); p.restore();
}
function placeholder() { fx.fillStyle = '#c98f64'; fx.fillRect(0, 0, 256, 256); fx.font = '150px serif'; fx.textAlign = 'center'; fx.fillText('🙂', 128, 190); faceTex.needsUpdate = true; drawPrev(); }
placeholder();
const img = new Image();
img.onload = () => {
  const w = img.width, h = img.height, sw = w * FACE.s;
  if (window.FACE_DATA) fx.drawImage(img, 0, 0, 256, 256);
  else fx.drawImage(img, w * FACE.x, h * FACE.y, sw, sw, 0, 0, 256, 256);
  faceTex.needsUpdate = true; drawPrev();
};
img.onerror = () => { if (typeof toast === 'function') toast('Photo not found: put it at ' + FACE.path); }; // guarded: toast is defined in a later script file
img.crossOrigin = 'anonymous';
img.src = window.FACE_DATA || FACE.path;

/* ---------- PLAYER ---------- */
const LANES = [-2.2, 0, 2.2];
const P = new THREE.Group(); S.add(P);
const rig = new THREE.Group(); rig.scale.setScalar(0.8); P.add(rig);
B(0x2b2554, 0.85, 0.95, 0.45, 0, 1.2, 0, rig);
const legs = [-0.2, 0.2].map(x => { const g = new THREE.Group(); g.position.set(x, 0.8, 0); B(0xece4d0, 0.3, 0.8, 0.32, 0, -0.4, 0, g); B(0x222222, 0.34, 0.15, 0.45, 0, -0.82, -0.05, g); rig.add(g); return g; });
const arms = [-0.55, 0.55].map(x => { const g = new THREE.Group(); g.position.set(x, 1.6, 0); B(0x2b2554, 0.22, 0.8, 0.26, 0, -0.35, 0, g); rig.add(g); return g; });
const head = new THREE.Group(); head.position.y = 2.15; rig.add(head);
Sp(0xd9a77c, 0.78, 0.85, 0.78, 0, 0, 0, head);
Sp(0x16110e, 0.86, 0.7, 0.86, 0, 0.18, 0, head);
const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false });
const faceGeo = new THREE.CircleGeometry(0.34, 24);
const fBack = new THREE.Mesh(faceGeo, faceMat); fBack.position.set(0, -0.02, 0.45);
const fFront = new THREE.Mesh(faceGeo, faceMat); fFront.position.set(0, -0.02, -0.45); fFront.rotation.y = Math.PI;
head.add(fBack, fFront);

/* =====================================================================
   NEPAL WORLD: five zones, procedural props, smooth transitions
   ===================================================================== */
// The selected world (index into ZONES) stays locked until another one is chosen on the world-select screen.
let WORLD = Math.min(4, Math.max(0, Math.floor(+LS.get('world', 0)) || 0));
if (!isOwned(WORLD)) { WORLD = 0; LS.set('world', 0); } // old saves that had Pokhara selected -> Kathmandu
const DENS = lowEnd ? 0.7 : 1; // decorative density on weak phones
const rr = (a, b) => a + Math.random() * (b - a);
const chance = p => Math.random() < p * DENS;
const hex = h => new THREE.Color(h).convertSRGBToLinear(); // all authored colours are sRGB
const mix = (a, b, t) => a + (b - a) * t;
const face = side => (side > 0 ? Math.PI : 0);
const stepY = (x, x0, w, h, n) => { const d = Math.abs(x) - x0; return d < 0 ? 0 : (Math.min(n - 1, Math.floor(d / w)) + 1) * h; };
const rot = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
const WHITE = hex(0xffffff);
const ANISO = Math.min(4, R.capabilities.getMaxAnisotropy());
function mkTex(w, h, paint, rep2) { // small procedural canvas texture
  const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = ANISO;
  if (rep2) t.repeat.set(rep2[0], rep2[1]); return t;
}
function speckle(x, w, h, n, a) { for (let i = 0; i < n; i++) { const v = i % 2 ? 255 : 0; x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (Math.random() * a) + ')'; x.fillRect(rnd(w), rnd(h), 1 + rnd(3), 1 + rnd(3)); } }
const FLAGCOLS = [0x2f6fd6, 0xf5f5f5, 0xd63031, 0x2e9e4f, 0xf5c518];
let bannerTO;

const ZONES = [
  { title: 'WELCOME TO KATHMANDU', sub: 'काठमाडौं', top: hex(0x79a9d2), hor: hex(0xf0cfa6), fogN: 50, fogF: 170, sun: hex(0xffe2b8), sunI: 0.9, hemiS: hex(0xfff1dd), hemiG: hex(0x6b5a4a), hemiI: 0.95, ground: hex(0x8d8a82), walk: hex(0x9a8f80), road: hex(0xffffff), mtnBody: hex(0x6f8a76), mtnH: 0.45, snowAmt: 0, hills: hex(0x7f9a6a), snowFall: 0 },
  { title: 'ENTERING NEPALI COUNTRYSIDE', sub: 'नेपाली गाउँघर', top: hex(0x4f9bde), hor: hex(0xd3e8f0), fogN: 60, fogF: 175, sun: hex(0xfff0d0), sunI: 0.95, hemiS: hex(0xf4fbff), hemiG: hex(0x5c6b3d), hemiI: 1.0, ground: hex(0x7fae4a), walk: hex(0x9a8a66), road: hex(0xe6dccb), mtnBody: hex(0x5f8a6a), mtnH: 0.7, snowAmt: 0.25, hills: hex(0x6fa152), snowFall: 0 },
  { title: 'WELCOME TO POKHARA', sub: 'पोखरा', top: hex(0x3d8fe3), hor: hex(0xbfe2f5), fogN: 70, fogF: 175, sun: hex(0xfff4e0), sunI: 1.0, hemiS: hex(0xf2f8ff), hemiG: hex(0x5f7a4f), hemiI: 1.05, ground: hex(0x8ab85a), walk: hex(0xb7ad9b), road: hex(0xffffff), mtnBody: hex(0x6c7f96), mtnH: 1.35, snowAmt: 1, hills: hex(0x5f9c58), snowFall: 0 },
  { title: 'ENTERING THE HIMALAYAS', sub: 'हिमाली राजमार्ग', top: hex(0x6a8db0), hor: hex(0xb4c3ce), fogN: 28, fogF: 115, sun: hex(0xdfe8f5), sunI: 0.8, hemiS: hex(0xdfe9f5), hemiG: hex(0x555a54), hemiI: 0.9, ground: hex(0x6e7562), walk: hex(0x8c8e88), road: hex(0xe2e2e2), mtnBody: hex(0x70808f), mtnH: 1.2, snowAmt: 1, hills: hex(0x4f6f4c), snowFall: 0.25 },
  { title: 'WELCOME TO THE HIGH HIMALAYAS', sub: 'उच्च हिमाल', top: hex(0x84a6cf), hor: hex(0xe2ebf3), fogN: 30, fogF: 130, sun: hex(0xeaf2ff), sunI: 0.85, hemiS: hex(0xe8f1ff), hemiG: hex(0x8a96a6), hemiI: 1.0, ground: hex(0xf0f4f8), walk: hex(0xe4ecf2), road: hex(0xcdd8e2), mtnBody: hex(0x8a97a8), mtnH: 1.6, snowAmt: 1, hills: hex(0xdfe8f0), snowFall: 1 }
];
const ENV = { key: -1, snow: 0 };
[1.08, 1.05, 1.05, 0.95, 1.0].forEach((e, i) => { ZONES[i].exp = e; }); // per-world exposure

/* ---------- Texture atlas: signs (Devanagari), windows, white swatch ---------- */
const AW = 1024, AH = 512;
const atlasC = document.createElement('canvas'); atlasC.width = AW; atlasC.height = AH;
const atlasX = atlasC.getContext('2d');
const atlasTex = new THREE.CanvasTexture(atlasC); atlasTex.encoding = THREE.sRGBEncoding;
atlasTex.generateMipmaps = false; atlasTex.minFilter = THREE.LinearFilter;
const uvr = (x, y, w, h) => [x / AW, 1 - (y + h) / AH, (x + w) / AW, 1 - y / AH];
const CELL = { win: uvr(0, 384, 128, 128), glass: uvr(128, 384, 128, 128), shut: uvr(256, 384, 128, 128), white: uvr(384, 384, 128, 128) };
const SIGNS = [
  ['चिया पसल', '#b5222a'], ['मोमो', '#e07a10'], ['काठमाडौं', '#1d6f6a'], ['खाजा घर', '#6a3f9c'], ['होटल हिमाल', '#1d5fa5'], ['किराना पसल', '#9a7b1c'], ['नमस्ते नेपाल', '#a3152d'], ['ठमेल', '#2a7f4f'],
  ['स्वागतम्', '#2a7f4f'], ['गाउँघर', '#8a5a2b'], ['होमस्टे', '#c2571a'], ['दुध डेरी', '#2b6cb0'],
  ['पोखरा', '#1b7fa8'], ['फेवा ताल', '#0f7a8a'], ['बोटिङ', '#d94f2a'], ['लेकसाइड होटल', '#7a3b8c'],
  ['सावधान!', '#c0392b'], ['पहिरो जोखिम', '#d35400'], ['चिया नास्ता', '#8e5b1a'], ['ट्रेकिङ', '#1f6f4a'],
  ['नमस्ते', '#b5222a'], ['सगरमाथा', '#1d4f8f'], ['ट्रेकर्स लज', '#5b3a24'], ['हिमाल', '#3a6ea5']
];
const signUV = i => uvr((i % 4) * 256, Math.floor(i / 4) * 64, 256, 64);
function paintAtlas() {
  const c = atlasX; c.fillStyle = '#fff'; c.fillRect(0, 0, AW, AH);
  SIGNS.forEach(([t, bg], i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 64;
    c.fillStyle = bg; c.fillRect(x, y, 256, 64); c.strokeStyle = '#f5d76e'; c.lineWidth = 3; c.strokeRect(x + 3, y + 3, 250, 58);
    c.fillStyle = '#fff'; c.font = 'bold 30px "Noto Sans Devanagari","Mangal","Nirmala UI","Kohinoor Devanagari",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, x + 128, y + 34, 236);
  });
  let x = 0, y = 384; // carved wooden lattice window
  c.fillStyle = '#3a2316'; c.fillRect(x, y, 128, 128); c.fillStyle = '#14100d'; c.fillRect(x + 10, y + 10, 108, 108);
  c.strokeStyle = '#8a5a30'; c.lineWidth = 5; c.beginPath();
  for (let i = 1; i < 6; i++) { c.moveTo(x + 10 + i * 18, y + 10); c.lineTo(x + 10 + i * 18, y + 118); c.moveTo(x + 10, y + 10 + i * 18); c.lineTo(x + 118, y + 10 + i * 18); }
  c.stroke();
  x = 128; c.fillStyle = '#e8e2d4'; c.fillRect(x, y, 128, 128); c.fillStyle = '#4d7da3'; c.fillRect(x + 10, y + 10, 108, 108);
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 16, y + 16, 36, 90); c.fillStyle = '#e8e2d4'; c.fillRect(x + 62, y + 10, 5, 108);
  x = 256; c.fillStyle = '#8d949b'; c.fillRect(x, y, 128, 128); c.fillStyle = '#6f767d';
  for (let i = 0; i < 128; i += 8) c.fillRect(x, y + i, 128, 3);
  atlasTex.needsUpdate = true;
}
paintAtlas();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintAtlas);

/* ---------- Geometry baker: many primitives -> ONE geometry (vertex colours + atlas) ---------- */
const DETAIL_GLSL = `
varying float vKind; varying vec3 vOP; varying vec3 vON;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x), mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x), f.y); }
vec3 surfDetail(float kind, vec3 p, vec3 n){
  if(kind<0.5) return vec3(1.);
  vec3 an=abs(n); vec2 uv = (an.x>an.z && an.x>an.y) ? p.zy : (an.z>an.y ? p.xy : p.xz);
  float g = vn(uv*0.8+vec2(p.y*0.3))*0.5 + vn(uv*3.1)*0.35 + vn(uv*9.)*0.15;
  float grime = 0.8 + 0.4*g;
  if(kind<1.5){
    vec2 b = vec2(uv.x/0.5, uv.y/0.2); float row=floor(b.y); b.x += mod(row,2.)*0.5; vec2 f=fract(b);
    float mortar = min(step(f.x,0.07)+step(f.y,0.13),1.);
    float tint = 0.82+0.36*h21(vec2(floor(b.x),row));
    return vec3(grime*tint*(1.-0.3*mortar)*(0.78+0.22*smoothstep(0.,2.5,p.y)));
  }
  if(kind<2.5){ float st=smoothstep(.45,.9,vn(uv*1.3+3.7)); return vec3(grime*(1.-0.2*st)*(0.8+0.2*smoothstep(0.,2.,p.y))); }
  if(kind<3.5){ float gr=vn(vec2(uv.x*0.7,uv.y*16.)); return vec3(grime*(0.78+0.4*gr)); }
  if(kind<4.5){ return vec3(grime*(0.86+0.14*sin(uv.y*55.))); }
  float r=floor(uv.x*4.); float x=uv.y*3.+mod(r,2.)*.5; float f=fract(x);
  float edge=smoothstep(0.,.14,f)*smoothstep(1.,.86,f); float rowE=smoothstep(0.,.25,fract(uv.x*4.));
  return vec3(grime*(0.68+0.32*edge*rowE)*(0.88+0.24*h21(vec2(floor(x),r))));
}`;
const WORLDMAT = new THREE.MeshStandardMaterial({ map: atlasTex, vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.35 });
WORLDMAT.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aKind;\nvarying float vKind;\nvarying vec3 vOP;\nvarying vec3 vON;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind=aKind; vOP=position; vON=normal;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + DETAIL_GLSL)
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= surfDetail(vKind, vOP, normalize(vON));');
};
ENVMATS.push(WORLDMAT);
// Vehicle material: Builder kind 0 = paint, 1 = glass, 2 = rubber/plastic, 3 = chrome/metal, 4 = glowing lights
const VEHMAT = new THREE.MeshStandardMaterial({ map: atlasTex, vertexColors: true, roughness: 0.4, metalness: 0.4, envMapIntensity: 1.1 });
VEHMAT.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aKind;\nvarying float vKind;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind=aKind;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vKind;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = (vKind<0.5)?0.36:(vKind<1.5)?0.06:(vKind<2.5)?0.9:(vKind<3.5)?0.22:0.4;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = (vKind<0.5)?0.45:(vKind<1.5)?0.9:(vKind<2.5)?0.0:(vKind<3.5)?1.0:0.0;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif(vKind>3.5) totalEmissiveRadiance += diffuseColor.rgb*1.6;');
};
ENVMATS.push(VEHMAT);
const IC = new THREE.IcosahedronGeometry(0.5, 1), CY7 = new THREE.CylinderGeometry(0.5, 0.5, 1, 7), CY10 = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const TCY = new THREE.CylinderGeometry(0.35, 0.5, 1, 6), CN7 = new THREE.ConeGeometry(0.5, 1, 7), CN4 = new THREE.ConeGeometry(0.5, 1, 4);
const FR4 = new THREE.CylinderGeometry(0.3, 0.5, 1, 4), PLG = new THREE.PlaneGeometry(1, 1), CY16 = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const flagShape = new THREE.Shape(); flagShape.moveTo(0, 0); flagShape.lineTo(1, 0); flagShape.lineTo(0.4, 0.55); flagShape.lineTo(0.8, 0.55); flagShape.lineTo(0, 1.22); flagShape.closePath();
const FLAGG = new THREE.ShapeGeometry(flagShape);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _nm = new THREE.Matrix3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _n = new THREE.Vector3(), _col = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);
const NI = new Map();
class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.kk = []; this.kd = 0; }
  k(n) { this.kd = n; return this; } // surface kind: 0 plain, 1 brick, 2 plaster, 3 wood, 4 metal, 5 roof tile
  geo(g, color, m, uv) {
    _nm.getNormalMatrix(m);
    let ng = NI.get(g); if (!ng) { ng = g.index ? g.toNonIndexed() : g; NI.set(g, ng); }
    const pa = ng.attributes.position, na = ng.attributes.normal, ua = ng.attributes.uv;
    _col.set(color).convertSRGBToLinear(); const cr = _col.r, cg = _col.g, cb = _col.b;
    const rc = uv || CELL.white, cu = (rc[0] + rc[2]) / 2, cv2 = (rc[1] + rc[3]) / 2;
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize(); this.n.push(_n.x, _n.y, _n.z);
      this.c.push(cr, cg, cb); this.kk.push(uv ? 0 : this.kd);
      if (uv) this.u.push(rc[0] + ua.getX(i) * (rc[2] - rc[0]), rc[1] + ua.getY(i) * (rc[3] - rc[1])); else this.u.push(cu, cv2);
    }
    return this;
  }
  t(g, c, x, y, z, sx, sy, sz, rx, ry, rz, uv) {
    _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0)); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); return this.geo(g, c, _m, uv);
  }
  bx(c, w, h, d, x, y, z, rx, ry, rz) { return this.t(BG, c, x, y, z, w, h, d, rx, ry, rz); }
  ic(c, w, h, d, x, y, z) { return this.t(IC, c, x, y, z, w, h, d); }
  cy(c, w, h, d, x, y, z, rx, ry, rz) { return this.t(CY7, c, x, y, z, w, h, d, rx, ry, rz); }
  cn(c, w, h, d, x, y, z) { return this.t(CN7, c, x, y, z, w, h, d); }
  c4(c, w, h, d, x, y, z) { return this.t(CN4, c, x, y, z, w / 0.7071, h, d / 0.7071, 0, Math.PI / 4, 0); }
  fr(c, w, h, d, x, y, z) { return this.t(FR4, c, x, y, z, w / 0.7071, h, d / 0.7071, 0, Math.PI / 4, 0); }
  ex(c, shp, w) { // extrude a side-profile (u = length, front at +u; v = height) into a smooth, bevelled body of width w
    const d = w - 0.12, g = new THREE.ExtrudeGeometry(shp, { depth: d, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -d / 2); smoothGeo(g, 0.75);
    this.t(g, c, 0, 0, 0, 1, 1, 1, 0, Math.PI / 2, 0); NI.delete(g); g.dispose(); return this;
  }
  lt(c, pts, x, y, z, sx, sy, sz, ry, seg) { // turned/lathe shape from a [radius, height] profile
    const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg || 16);
    this.t(g, c, x, y, z, sx, sy, sz, 0, ry || 0, 0); NI.delete(g); g.dispose(); return this;
  }
  pl(c, w, h, x, y, z, ry, uv) { return this.t(PLG, c, x, y, z, w, h, 1, 0, ry || 0, 0, uv); }
  fl(c, w, d, x, y, z) { return this.t(PLG, c, x, y, z, w, d, 1, -Math.PI / 2, 0, 0); }
  wh(x, y, z, dia, th) { return this.t(CY10, 0x1a1a1a, x, y, z, dia, th, dia, 0, 0, Math.PI / 2); }
  ln(c, a, b2, th) {
    const dx = b2[0] - a[0], dy = b2[1] - a[1], dz = b2[2] - a[2], len = Math.hypot(dx, dy, dz) || 0.001;
    _q.setFromUnitVectors(_up, _v2.set(dx / len, dy / len, dz / len));
    _m.compose(_p.set((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, (a[2] + b2[2]) / 2), _q, _s.set(th, len, th));
    return this.geo(BG, c, _m);
  }
  flag(x, y, z, s) { // Nepal's double-pennant flag (faces +z)
    this.t(FLAGG, 0x1f3a93, x, y, z, s, s, 1).t(FLAGG, 0xdc143c, x + s * 0.056, y + s * 0.063, z + 0.02, s * 0.86, s * 0.86, 1); return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kk, 1)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere(); return g;
  }
}
function flagString(b, p1, p2, th) {
  for (let j = 0; j < 5; j++) {
    const t0 = j / 5, t1 = (j + 1) / 5;
    b.ln(FLAGCOLS[j], [mix(p1[0], p2[0], t0), mix(p1[1], p2[1], t0), mix(p1[2], p2[2], t0)], [mix(p1[0], p2[0], t1), mix(p1[1], p2[1], t1), mix(p1[2], p2[2], t1)], th || 0.1);
  }
}

/* ---------- Prop builders (all face +x = toward the road unless noted) ---------- */
const PI2 = Math.PI / 2;
const GCOL = [0xd62828, 0xf4c20d, 0x2a9d8f, 0x1d6fa5, 0xf77f00, 0xe9e4d4, 0x7a4a9c];
function bNewari(fl, brick, sign, flag) { // Newari house: upper floors jut out, carved lattice windows, open shop front, layered tile roof
  const b = new Builder(), FH = 2.7, shop = sign === 0 ? 1 : (sign === 1 || sign === 3) ? 2 : 0;
  const fx = f => 2.5 + 0.18 * f, x1t = fx(fl - 1), H = 0.4 + fl * FH;
  b.k(2).bx(0x3a2a22, 5.2, 0.5, 12.2, 0, 0.25, 0);
  for (let f = 0; f < fl; f++) {
    const x1 = fx(f), y0 = 0.4 + f * FH, cx = (x1 - 2.5) / 2;
    b.k(1).bx(brick, x1 + 2.5, FH, 12, cx, y0 + FH / 2, 0);
    b.k(3).bx(0x3b2418, x1 + 2.9, 0.2, 12.4, cx + 0.2, y0 + FH, 0);
    if (f === 0) {
      const sz = -2.0;
      b.k(0).bx(0x161009, 0.1, 2.2, 6.6, 2.5, 1.5, sz);
      b.k(3).bx(0x5a3520, 0.25, 2.4, 0.2, 2.62, 1.6, sz - 3.4).bx(0x5a3520, 0.25, 2.4, 0.2, 2.62, 1.6, sz + 3.4);
      for (let r = 0; r < 3; r++) {
        const y = 1.15 + r * 0.4; b.k(3).bx(0x5a3520, 0.35, 0.05, 6.2, 2.72, y, sz).k(0);
        for (let i = 0; i < 9; i++) { const h = rr(0.16, 0.3); b.bx(pick(GCOL), 0.22, h, rr(0.2, 0.5), 2.74, y + 0.025 + h / 2, sz + rr(-2.9, 2.9)); }
      }
      b.k(3).bx(0x7a4a2a, 0.7, 0.95, 6.4, 3.0, 0.5, sz).k(0);
      if (shop === 1) { for (let i = 0; i < 3; i++) b.t(CY10, 0xb8b8c0, 3.0, 1.15, sz - 2.2 + i * 1.4, 0.42, 0.36, 0.42); for (let i = 0; i < 6; i++) b.t(CY10, 0xf4f4f4, 3.0, 1.05, sz + 0.3 + i * 0.28, 0.12, 0.15, 0.12); }
      else if (shop === 2) [-2.2, 0.4].forEach(z => b.t(CY10, 0xcfcac0, 3.0, 1.2, sz + z, 0.75, 0.5, 0.75).t(CY10, 0xcfcac0, 3.0, 1.65, sz + z, 0.7, 0.4, 0.7).cn(0xb8b4aa, 0.72, 0.25, 0.72, 3.0, 1.95, sz + z));
      else for (let i = 0; i < 4; i++) b.ic(0xcdb88a, 0.7, 0.6, 0.7, 3.7, 0.3, sz - 2.4 + i * 1.5);
      b.k(4).t(CY10, 0x8d949b, 2.62, 2.52, sz, 0.3, 6.6, 0.3, PI2, 0, 0);
      const aw = shop === 1 ? 0xd62828 : shop === 2 ? 0xf77f00 : 0x1d6fa5;
      b.k(0); for (let i = 0; i < 6; i++) b.bx(i % 2 ? 0xf2f2f2 : aw, 1.15, 0.05, 1.1, 3.15, 2.38, sz - 2.75 + i * 1.1, 0, 0, -0.3);
      b.k(3).bx(0x4a2c1a, 0.15, 1.15, 4.6, 3.0, 3.3, sz).bx(0x3a2418, 0.2, 2.2, 1.2, 2.55, 1.5, 3.5).bx(0x5a3520, 0.3, 2.4, 0.2, 2.6, 1.6, 2.8).bx(0x5a3520, 0.3, 2.4, 0.2, 2.6, 1.6, 4.2);
      b.k(0).pl(0xffffff, 4.4, 1.0, 3.09, 3.3, sz, PI2, signUV(sign));
    } else {
      b.k(3).bx(0x6b3f22, 0.4, 1.7, 3.4, x1 + 0.18, y0 + 1.5, 0).bx(0x3a2418, 0.55, 0.14, 3.7, x1 + 0.25, y0 + 2.45, 0).bx(0x3a2418, 0.5, 0.1, 3.7, x1 + 0.25, y0 + 0.6, 0);
      b.bx(0x3a2418, 0.1, 1.5, 0.08, x1 + 0.42, y0 + 1.5, 0.55).bx(0x3a2418, 0.1, 1.5, 0.08, x1 + 0.42, y0 + 1.5, -0.55);
      b.pl(0xffffff, 3, 1.4, x1 + 0.4, y0 + 1.5, 0, PI2, CELL.win);
      [-4.3, 4.3].forEach(z => b.k(3).bx(0x5a3520, 0.3, 1.5, 1.4, x1 + 0.15, y0 + 1.4, z).bx(0x3a2418, 0.4, 0.1, 1.7, x1 + 0.2, y0 + 2.2, z).pl(0xffffff, 1, 1.2, x1 + 0.32, y0 + 1.4, z, PI2, CELL.win));
      if (f === 1) [-3.6, 3.6].forEach(z => {
        b.k(3).bx(0x7a4a2a, 1.1, 0.15, 3.4, x1 + 0.6, y0 + 0.1, z).bx(0x6b3f22, 0.1, 0.1, 3.4, x1 + 1.1, y0 + 1.0, z);
        for (let k = -1; k <= 1; k += 0.5) b.bx(0x6b3f22, 0.07, 0.85, 0.07, x1 + 1.1, y0 + 0.55, z + k * 1.5);
        [-1.2, 1.2].forEach(o => b.ln(0x5a3520, [x1, y0 - 0.55, z + o], [x1 + 1.1, y0, z + o], 0.1));
      });
    }
  }
  const cxr = (x1t - 2.5) / 2, hs = (x1t + 2.5) / 2 + 0.5, ta = Math.tan(0.38), rise = hs * ta, ry0 = H + 0.1;
  b.k(1); for (let j = 0; j < 3; j++) b.bx(brick, Math.max(0.3, 2 * (rise - (j + 1) * rise / 3) / ta * 0.98), rise / 3, 11.9, cxr, ry0 + rise / 6 + j * rise / 3, 0);
  b.k(5).bx(0xb04b2c, hs / Math.cos(0.38) + 0.1, 0.2, 12.9, cxr - hs / 2, ry0 + rise / 2 + 0.08, 0, 0, 0, 0.38).bx(0xb04b2c, hs / Math.cos(0.38) + 0.1, 0.2, 12.9, cxr + hs / 2, ry0 + rise / 2 + 0.08, 0, 0, 0, -0.38);
  b.bx(0xa8431f, 0.9, 0.18, 13.0, cxr - hs - 0.35, ry0 - 0.12, 0, 0, 0, 0.14).bx(0xa8431f, 0.9, 0.18, 13.0, cxr + hs + 0.35, ry0 - 0.12, 0, 0, 0, -0.14).bx(0x7a3320, 0.35, 0.22, 13, cxr, ry0 + rise + 0.2, 0);
  b.k(0); [-4, 0, 4].forEach(z => b.cn(0xd9a21b, 0.3, 0.7, 0.3, cxr, ry0 + rise + 0.55, z));
  if (flag) b.bx(0xcccccc, 0.07, 2.4, 0.07, cxr, ry0 + rise + 1.4, 4.5).flag(cxr + 0.03, ry0 + rise + 0.9, 4.55, 0.9);
  return b.build();
}
function bPokhara(fl, wall, trim, sign) { // pastel lakeside shops/hotels with glass fronts and balconies
  const b = new Builder(), H = fl * 3 + 0.3;
  b.bx(wall, 5, H, 12, 0, H / 2, 0).bx(trim, 5.3, 0.3, 12.3, 0, H + 0.15, 0);
  b.bx(trim, 0.25, 0.5, 12.3, 2.5, H + 0.55, 0).bx(trim, 0.25, 0.5, 12.3, -2.5, H + 0.55, 0).bx(trim, 5, 0.5, 0.25, 0, H + 0.55, 6.05).bx(trim, 5, 0.5, 0.25, 0, H + 0.55, -6.05);
  for (let f = 0; f < fl; f++) {
    const y0 = 0.3 + f * 3;
    if (f === 0) b.pl(0xffffff, 4.8, 2.1, 2.52, y0 + 1.2, -2.9, PI2, CELL.glass).bx(0x3b4a5a, 0.1, 2.2, 1.3, 2.52, y0 + 1.2, 3.6);
    else [-3.8, 0, 3.8].forEach(z => b.pl(0xffffff, 1.6, 1.5, 2.52, y0 + 1.6, z, PI2, CELL.glass).bx(trim, 0.3, 0.12, 1.9, 2.62, y0 + 0.85, z));
    if (f === 1) { b.bx(0xf4f1ea, 0.9, 0.14, 10.5, 2.95, y0 + 0.05, 0).bx(0x555a60, 0.06, 0.07, 10.5, 3.38, y0 + 0.95, 0); for (let k = -5; k <= 5; k++) b.bx(0x555a60, 0.05, 0.9, 0.05, 3.38, y0 + 0.5, k); }
  }
  b.pl(0xffffff, 4.2, 1.05, 2.6, 2.85, -2.9, PI2, signUV(sign));
  b.cy(0x2b6cb0, 1.4, 1.2, 1.4, -1, H + 1.1, 3).bx(0x444444, 0.1, 0.5, 0.1, -1, H + 0.5, 3);
  return b.build();
}
function bFarm(roof, thatch) { // traditional Nepali house: ochre base, whitewash, veranda
  const b = new Builder();
  b.bx(0xb85a32, 4.4, 1.0, 6, 0, 0.5, 0).bx(0xf2ead8, 4.3, 1.6, 5.9, 0, 1.8, 0).bx(0x5a3a22, 0.1, 1.7, 1.0, 2.2, 0.95, 1.2);
  b.bx(0x5a3a22, 0.12, 0.95, 0.95, 2.2, 1.9, -1.5).pl(0xffffff, 0.8, 0.8, 2.27, 1.9, -1.5, PI2, CELL.win);
  b.bx(0x7a4a2a, 1.2, 0.12, 6, 2.8, 0.95, 0);
  [-2.8, 0, 2.8].forEach(z => b.bx(0x5a3a22, 0.14, 1.5, 0.14, 3.3, 1.7, z));
  b.bx(roof, 1.8, 0.12, 6.4, 3.0, 2.65, 0, 0, 0, -0.25);
  b.bx(0xf2ead8, 3.8, 0.5, 5.8, 0, 2.85, 0).bx(0xf2ead8, 2.4, 0.5, 5.8, 0, 3.3, 0).bx(0xf2ead8, 0.9, 0.5, 5.8, 0, 3.75, 0);
  b.bx(roof, 2.9, 0.22, 6.6, -1.35, 3.45, 0, 0, 0, 0.5).bx(roof, 2.9, 0.22, 6.6, 1.35, 3.45, 0, 0, 0, -0.5).bx(thatch, 0.3, 0.2, 6.7, 0, 4.2, 0);
  b.bx(0x8a7a6a, 0.5, 1.0, 0.5, -1.2, 4.0, -1.5);
  return b.build();
}
function hse(b, x, z, w, d, h, wall, roof, snow) {
  b.bx(wall, w, h, d, x, h / 2, z).bx(roof, w + 0.6, 0.28, d + 0.6, x, h + 0.14, z);
  if (snow) b.bx(0xf5f9fc, w + 0.7, 0.35, d + 0.7, x, h + 0.42, z);
  b.bx(0x4a3322, 0.1, 1.2, 0.8, x + w / 2 + 0.02, 0.6, z + d * 0.2).bx(0x4a3322, 0.1, 0.6, 0.6, x + w / 2 + 0.02, h * 0.62, z - d * 0.2).bx(0x6b4a2a, 0.5, 0.12, d * 0.7, x + w / 2 + 0.25, h * 0.55, z);
}
function bHamlet(snow) { // small Himalayan stone village with prayer flags
  const b = new Builder(), wl = 0x8d877b, rf = snow ? 0xf4f8fb : 0x57524c;
  hse(b, 0, -6, 4.4, 4, 3, wl, rf, snow); hse(b, -1, 0, 5, 4.4, 3.6, 0xb8b0a2, rf, snow); hse(b, 0.5, 6, 4, 3.6, 2.8, wl, rf, snow);
  b.bx(0x7d776c, 0.4, 0.8, 16, 3.5, 0.4, 0).bx(0x5a3d26, 0.1, 5, 0.1, 3.8, 2.5, 3);
  flagString(b, [3.8, 5, 3], [0, 4.2, -4], 0.08);
  return b.build();
}
const DOMEPROF = Array.from({ length: 9 }, (_, i) => { const a = i / 8 * Math.PI / 2; return [Math.cos(a) * 0.5, Math.sin(a) * 0.5]; });
const ROOFSTEP = [[0.5, 0], [0.4, 0.12], [0.34, 0.38], [0.3, 0.75], [0.28, 1.0]], ROOFTOP = [[0.5, 0], [0.4, 0.12], [0.28, 0.45], [0.16, 0.8], [0.0, 1.15]];
function bStupa() { // Boudhanath-style stupa: stepped mandala base, turned dome, eyes, 9-ring spire, prayer-flag strings
  const b = new Builder().k(2);
  b.t(CY16, 0xf1efe8, 0, 0.25, 0, 9.4, 0.5, 9.4).t(CY16, 0xf1efe8, 0, 0.75, 0, 8.0, 0.5, 8.0).t(CY16, 0xf1efe8, 0, 1.25, 0, 6.6, 0.5, 6.6);
  b.lt(0xfaf8f2, DOMEPROF, 0, 1.5, 0, 5.8, 6.0, 5.8, 0, 20);
  b.k(0).bx(0xd9a21b, 1.9, 1.5, 1.9, 0, 5.25, 0);
  for (let k = 0; k < 4; k++) {
    const a = k * PI2; let [ex, ez] = rot(0, 0.97, a);
    b.pl(0xffffff, 1.5, 0.34, ex, 5.4, ez, a);
    [-0.4, 0.4].forEach(s2 => { const [qx, qz] = rot(s2, 0.98, a); b.pl(0x1b2a6b, 0.22, 0.2, qx, 5.4, qz, a); });
    [ex, ez] = rot(0, 0.98, a); b.pl(0xc0392b, 0.18, 0.18, ex, 5.75, ez, a);
  }
  for (let i = 0; i < 9; i++) { const w = 1.5 - i * 0.12; b.t(CY7, i % 2 ? 0xe0b030 : 0xc8921a, 0, 6.17 + i * 0.33, 0, w, 0.33, w); }
  b.cn(0xe0a82e, 1.1, 0.6, 1.1, 0, 9.2, 0).ic(0xf5d76e, 0.4, 0.4, 0.4, 0, 9.6, 0);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; flagString(b, [0, 9.0, 0], [7.5 * Math.cos(a), 0.9, 7.5 * Math.sin(a)], 0.1); }
  return b.build();
}
function bPagoda() { // three-tier Newari temple: curved roofs, carved struts, corner bells
  const b = new Builder();
  b.k(2).bx(0xc9b99a, 11, 0.4, 11, 0, 0.2, 0).bx(0xc9b99a, 9.8, 0.4, 9.8, 0, 0.6, 0).bx(0xc9b99a, 8.6, 0.4, 8.6, 0, 1.0, 0);
  let y = 1.2;
  for (let i = 0; i < 3; i++) {
    const w = 6.2 - i * 1.1, last = i === 2;
    b.k(1).bx(0xa23b2a, w, 2.1, w, 0, y + 1.05, 0).k(3);
    for (let k = 0; k < 4; k++) { const a = k * PI2, [ex, ez] = rot(0, w / 2 + 0.05, a); b.pl(0xffffff, 1.8, 1.4, ex, y + 1.1, ez, a, CELL.win); }
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => { b.bx(0x3b2418, 0.3, 2.1, 0.3, sx * w / 2, y + 1.05, sz * w / 2); b.ln(0x5a3520, [sx * w / 2, y + 1.5, sz * w / 2], [sx * (w / 2 + 1.4), y + 2.3, sz * (w / 2 + 1.4)], 0.15); }));
    b.bx(0x3b2418, w + 0.4, 0.2, w + 0.4, 0, y + 2.2, 0);
    b.k(5).lt(0xb5702a, last ? ROOFTOP : ROOFSTEP, 0, y + 2.3, 0, (w + 3.2) / 0.7071, 1.5, (w + 3.2) / 0.7071, Math.PI / 4, 4);
    b.k(0); [-1, 1].forEach(sx => [-1, 1].forEach(sz => b.cn(0xd9a21b, 0.25, 0.5, 0.25, sx * (w + 3.2) / 2 * 0.98, y + 2.3, sz * (w + 3.2) / 2 * 0.98)));
    y += 3.8;
  }
  b.bx(0xd9a21b, 0.12, 1.8, 0.12, 0, y + 1.1, 0).ic(0xe0a82e, 0.5, 0.5, 0.5, 0, y + 2.1, 0);
  return b.build();
}
function bHillock() { // wooded hill (Swayambhunath-style); a small stupa is placed on top
  const b = new Builder();
  b.ic(0x5d7f3f, 26, 14, 26, 0, 5, 0).ic(0x6a8a46, 14, 8, 12, 9, 2, 5).ic(0x516f38, 12, 7, 10, -8, 2, -4);
  for (let i = 0; i < 10; i++) { const a = rr(0, 6.28), r = rr(4, 9), y = 5 + 7 * Math.sqrt(Math.max(0, 1 - (r / 13) * (r / 13))); b.ic(0x2f6a35, rr(2, 3.2), rr(2, 3), rr(2, 3.2), Math.cos(a) * r, y + 0.8, Math.sin(a) * r); }
  return b.build();
}
function bStall() { // momo street stall
  const b = new Builder();
  b.bx(0x8b5a2b, 1.3, 0.9, 1.8, 0, 0.45, 0).bx(0xd9d4c8, 1.35, 0.08, 1.85, 0, 0.93, 0);
  b.t(CY7, 0xcfcac0, -0.1, 1.3, 0.2, 0.7, 0.5, 0.7).t(CY7, 0xcfcac0, -0.1, 1.75, 0.2, 0.62, 0.45, 0.62).cn(0xb8b4aa, 0.64, 0.25, 0.64, -0.1, 2.1, 0.2);
  [-0.85, 0.85].forEach(z => [-0.6, 0.6].forEach(x => b.bx(0x5a3a22, 0.08, 2.4, 0.08, x, 1.2, z)));
  b.bx(0xd62828, 1.9, 0.08, 2.2, 0, 2.45, 0, 0, 0, 0.12).bx(0xf4d35e, 1.9, 0.09, 0.4, 0, 2.47, 0.5, 0, 0, 0.12).bx(0xf4d35e, 1.9, 0.09, 0.4, 0, 2.47, -0.5, 0, 0, 0.12);
  b.pl(0xffffff, 1.2, 0.3, 0.67, 0.55, 0, PI2, signUV(1));
  return b.build();
}
const TOR = new THREE.TorusGeometry(0.38, 0.16, 8, 14);
const shape = cmds => { const sp = new THREE.Shape(); cmds.forEach(c => { if (c[0] === 'm') sp.moveTo(c[1], c[2]); else if (c[0] === 'l') sp.lineTo(c[1], c[2]); else sp.quadraticCurveTo(c[1], c[2], c[3], c[4]); }); sp.closePath(); return sp; };
function smoothGeo(g, ang) { // average normals of coincident vertices unless the crease is sharper than ang
  const pa = g.attributes.position, na = g.attributes.normal, n = pa.count, map = new Map(), cosT = Math.cos(ang);
  for (let i = 0; i < n; i++) { const k = Math.round(pa.getX(i) * 1000) + ',' + Math.round(pa.getY(i) * 1000) + ',' + Math.round(pa.getZ(i) * 1000); const a = map.get(k); if (a) a.push(i); else map.set(k, [i]); }
  const out = new Float32Array(n * 3);
  for (const idx of map.values()) for (const i of idx) {
    let x = 0, y = 0, z = 0; const ix = na.getX(i), iy = na.getY(i), iz = na.getZ(i);
    for (const j of idx) { const jx = na.getX(j), jy = na.getY(j), jz = na.getZ(j); if (ix * jx + iy * jy + iz * jz > cosT) { x += jx; y += jy; z += jz; } }
    const l = Math.hypot(x, y, z) || 1; out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}
function wheel(b, x, y, z, r, th) { // tyre + rim + hub, axis along x
  const k = r / 0.54;
  b.k(2).t(TOR, 0x17171a, x, y, z, k, k, th / 0.32, 0, PI2, 0);
  b.k(3).t(CY10, 0x9a9da3, x, y, z, 1.1 * r, th * 0.6, 1.1 * r, 0, 0, PI2).t(CY10, 0xd0d3d8, x + Math.sign(x || 1) * th * 0.25, y, z, 0.4 * r, th * 0.3, 0.4 * r, 0, 0, PI2);
}
function rider(b, x, y, z, jacket, helmet) { // seated rider facing -z
  b.k(0).ic(helmet, 0.36, 0.38, 0.4, x, y + 0.78, z - 0.05).k(2).ic(0x1b1b1d, 0.3, 0.12, 0.1, x, y + 0.74, z - 0.25);
  b.k(0).t(TCY, jacket, x, y + 0.3, z + 0.1, 0.45, 0.7, 0.32, -0.25, 0, 0);
  [-1, 1].forEach(sd => { b.k(0).ln(jacket, [x + sd * 0.2, y + 0.5, z], [x + sd * 0.33, y + 0.15, z - 0.6], 0.1); b.k(2).bx(0x2a3350, 0.16, 0.55, 0.2, x + sd * 0.2, y - 0.1, z + 0.15, 0.5, 0, 0); });
}
function bBus(c1, c2, dest) { // Nepali local bus
  const b = new Builder(), W = 2.3;
  b.ex(c1, shape([['m', -3.1, 0.5], ['l', -3.1, 2.9], ['q', -3.1, 3.15, -2.85, 3.15], ['l', 2.7, 3.15], ['q', 3.1, 3.15, 3.14, 2.7], ['l', 3.14, 1.0], ['q', 3.14, 0.55, 2.9, 0.5]]), W);
  b.k(0).bx(c2, W + 0.03, 0.3, 6.0, 0, 1.25, 0).bx(0xf4f1e6, W + 0.03, 0.1, 6.0, 0, 0.9, 0);
  [-1, 1].forEach(sd => {
    b.k(1).bx(0x1d2a3a, 0.05, 0.95, 5.1, sd * 1.17, 2.3, 0.1);
    for (let i = 0; i < 7; i++) b.k(0).bx(c1, 0.07, 0.97, 0.1, sd * 1.18, 2.3, -2.4 + i * 0.8);
    b.k(2).t(CY10, 0x151515, sd * 1.18, 0.55, -2.1, 1.35, 0.04, 1.35, 0, 0, PI2).t(CY10, 0x151515, sd * 1.18, 0.55, 2.0, 1.35, 0.04, 1.35, 0, 0, PI2);
    wheel(b, sd * 1.08, 0.55, -2.1, 0.55, 0.42); wheel(b, sd * 1.08, 0.55, 2.0, 0.55, 0.46);
    b.k(3).bx(0x222226, 0.05, 0.5, 0.25, sd * 1.38, 2.0, -2.95);
    b.k(4).bx(0xfff4d0, 0.38, 0.22, 0.06, sd * 0.85, 0.98, -3.25).bx(0xff2a2a, 0.3, 0.45, 0.06, sd * 0.95, 1.0, 3.2).bx(0xff9a1a, 0.16, 0.12, 0.06, sd * 1.0, 1.3, -3.25);
  });
  b.k(1).bx(0x1d2a3a, 2.05, 1.15, 0.05, 0, 2.2, -3.23).bx(0x1d2a3a, 1.8, 0.8, 0.05, 0, 2.3, 3.2);
  b.k(0).pl(0xffffff, 1.7, 0.42, 0, 2.95, -3.26, Math.PI, signUV(dest));
  b.k(2).bx(0x1c1c1e, 1.6, 0.55, 0.06, 0, 0.85, -3.22);
  b.k(3).bx(0xc8c8cc, 2.3, 0.18, 0.2, 0, 0.55, -3.25).bx(0xc8c8cc, 2.3, 0.18, 0.2, 0, 0.55, 3.2).bx(0x666a70, 2.0, 0.05, 4.6, 0, 3.32, 0.2);
  b.k(0).bx(0xf5f5f0, 0.55, 0.18, 0.04, 0, 0.68, -3.27).bx(0xf5f5f0, 0.55, 0.18, 0.04, 0, 0.68, 3.22).bx(0xb08a5a, 1.6, 0.5, 1.4, 0, 3.6, 0.5).ic(0xcdb88a, 0.9, 0.5, 0.9, 0.2, 3.65, -0.8);
  return b.build();
}
function bMicrobus(c1, c2) { // HiAce-style microbus
  const b = new Builder(), W = 1.82;
  b.ex(c1, shape([['m', -2.2, 0.4], ['l', -2.2, 1.75], ['q', -2.2, 2.0, -1.95, 2.0], ['l', 0.7, 2.0], ['q', 1.1, 2.0, 1.3, 1.6], ['l', 1.75, 1.15], ['q', 2.05, 1.05, 2.2, 0.9], ['l', 2.2, 0.5], ['q', 2.2, 0.4, 2.1, 0.4]]), W);
  b.k(0).bx(c2, W + 0.03, 0.2, 4.3, 0, 0.95, 0);
  [-1, 1].forEach(sd => {
    b.k(1).bx(0x1d2a3a, 0.05, 0.62, 2.5, sd * 0.93, 1.55, 0.65).bx(0x1d2a3a, 0.05, 0.55, 0.9, sd * 0.93, 1.5, -1.0);
    b.k(0).bx(c1, 0.06, 0.66, 0.08, sd * 0.94, 1.55, -0.55);
    b.k(2).t(CY10, 0x151515, sd * 0.93, 0.36, -1.25, 0.86, 0.04, 0.86, 0, 0, PI2).t(CY10, 0x151515, sd * 0.93, 0.36, 1.35, 0.86, 0.04, 0.86, 0, 0, PI2);
    wheel(b, sd * 0.84, 0.36, -1.25, 0.36, 0.26); wheel(b, sd * 0.84, 0.36, 1.35, 0.36, 0.26);
    b.k(3).bx(0x222226, 0.05, 0.3, 0.2, sd * 1.05, 1.3, -1.35);
    b.k(4).bx(0xfff4d0, 0.3, 0.16, 0.06, sd * 0.62, 0.72, -2.24).bx(0xff2a2a, 0.12, 0.4, 0.06, sd * 0.78, 1.0, 2.2);
  });
  b.k(1).bx(0x1d2a3a, 1.6, 0.64, 0.04, 0, 1.4, -1.55, 0.785, 0, 0).bx(0x1d2a3a, 1.4, 0.5, 0.05, 0, 1.5, 2.22);
  b.k(2).bx(0x222226, 1.0, 0.25, 0.06, 0, 0.62, -2.23).bx(0x2a2a2e, W, 0.2, 0.2, 0, 0.48, -2.2);
  b.k(3).bx(0x666a70, 1.6, 0.05, 2.4, 0, 2.08, 0.2);
  b.k(0).bx(0xb08a5a, 1.2, 0.45, 1.5, 0, 2.35, 0.3).bx(0xf5f5f0, 0.5, 0.16, 0.04, 0, 0.66, 2.24);
  return b.build();
}
function bTempo() { // Kathmandu's green Safa electric tempo (three-wheeler)
  const b = new Builder(), W = 1.35;
  b.ex(0x2e9e5b, shape([['m', -1.5, 0.45], ['l', -1.5, 1.7], ['q', -1.5, 1.9, -1.3, 1.9], ['l', 0.6, 1.9], ['q', 0.95, 1.9, 1.05, 1.55], ['l', 1.3, 0.95], ['q', 1.4, 0.7, 1.4, 0.55], ['l', 1.4, 0.5], ['q', 1.4, 0.45, 1.3, 0.45]]), W);
  b.k(0).bx(0xf0e8c8, W + 0.03, 0.12, 2.6, 0, 1.92, -0.1).bx(0xf4f1e6, W + 0.03, 0.14, 2.7, 0, 0.9, 0);
  [-1, 1].forEach(sd => { b.k(1).bx(0x1d2a3a, 0.05, 0.6, 1.9, sd * 0.69, 1.5, 0.35); b.k(4).bx(0xff2a2a, 0.12, 0.3, 0.06, sd * 0.5, 0.9, 1.52); });
  b.k(1).bx(0x1d2a3a, 1.1, 0.7, 0.04, 0, 1.4, -1.0, 0.7, 0, 0).bx(0x1d2a3a, 1.0, 0.5, 0.05, 0, 1.5, 1.52);
  b.k(4).bx(0xfff4d0, 0.3, 0.2, 0.06, 0, 0.82, -1.47);
  b.k(2).bx(0x2a2a2e, 1.0, 0.2, 0.2, 0, 0.5, -1.46);
  wheel(b, 0, 0.3, -1.05, 0.3, 0.2); wheel(b, -0.62, 0.3, 0.9, 0.3, 0.2); wheel(b, 0.62, 0.3, 0.9, 0.3, 0.2);
  b.k(2).bx(0x2a2a2e, 0.4, 0.08, 0.7, 0, 0.62, -1.05);
  return b.build();
}
function bTaxi(c1) { // small hatchback taxi
  const b = new Builder(), W = 1.55;
  b.ex(c1, shape([['m', -1.7, 0.38], ['l', -1.7, 0.95], ['q', -1.7, 1.05, -1.55, 1.15], ['l', -1.2, 1.4], ['q', -1.05, 1.52, -0.8, 1.52], ['l', 0.15, 1.52], ['q', 0.4, 1.52, 0.55, 1.35], ['l', 0.95, 0.95], ['q', 1.0, 0.9, 1.1, 0.9], ['l', 1.6, 0.85], ['q', 1.72, 0.82, 1.72, 0.7], ['l', 1.72, 0.48], ['q', 1.72, 0.38, 1.6, 0.38]]), W);
  b.k(0).bx(0x1b7f4a, W + 0.03, 0.08, 3.3, 0, 0.78, 0);
  [-1, 1].forEach(sd => {
    b.k(1).bx(0x1d2a3a, 0.05, 0.4, 1.8, sd * 0.79, 1.27, 0.25);
    b.k(2).t(CY10, 0x151515, sd * 0.79, 0.3, -1.0, 0.72, 0.04, 0.72, 0, 0, PI2).t(CY10, 0x151515, sd * 0.79, 0.3, 1.05, 0.72, 0.04, 0.72, 0, 0, PI2);
    wheel(b, sd * 0.7, 0.3, -1.0, 0.3, 0.2); wheel(b, sd * 0.7, 0.3, 1.05, 0.3, 0.2);
    b.k(3).bx(0x222226, 0.05, 0.2, 0.2, sd * 0.92, 1.0, -0.7);
    b.k(4).bx(0xfff4d0, 0.3, 0.16, 0.06, sd * 0.5, 0.72, -1.76).bx(0xff2a2a, 0.3, 0.14, 0.06, sd * 0.6, 0.85, 1.76);
  });
  b.k(1).bx(0x1d2a3a, 1.3, 0.56, 0.04, 0, 1.17, -0.78, 0.785, 0, 0).bx(0x1d2a3a, 1.2, 0.4, 0.04, 0, 1.28, 1.4, -0.6, 0, 0);
  b.k(4).bx(0xffd060, 0.5, 0.14, 0.18, 0, 1.62, 0.1);
  b.k(2).bx(0x2a2a2e, 1.0, 0.18, 0.06, 0, 0.56, -1.78).bx(0x2a2a2e, W, 0.18, 0.2, 0, 0.42, -1.74);
  b.k(0).bx(0xf5f5f0, 0.5, 0.14, 0.04, 0, 0.62, 1.78).bx(0xf5f5f0, 0.45, 0.12, 0.04, 0, 0.5, -1.8);
  return b.build();
}
function bScooter(paint, withRider, jacket, helmet) {
  const b = new Builder();
  b.ex(paint, shape([['m', -0.95, 0.45], ['l', -0.95, 0.72], ['q', -0.9, 0.95, -0.65, 0.95], ['l', -0.05, 0.95], ['q', 0.12, 0.9, 0.15, 0.6], ['l', 0.1, 0.45]]), 0.42);
  b.k(0).bx(paint, 0.42, 0.08, 0.7, 0, 0.36, -0.5).bx(paint, 0.44, 0.85, 0.1, 0, 0.82, -0.82, 0.25, 0, 0).bx(paint, 0.2, 0.08, 0.5, 0, 0.62, -1.05).ic(paint, 0.3, 0.3, 0.25, 0, 1.22, -0.84);
  b.k(4).ic(0xfff4d0, 0.2, 0.2, 0.14, 0, 1.22, -0.92).bx(0xff2a2a, 0.2, 0.1, 0.05, 0, 0.82, 0.99);
  b.k(3).bx(0x9a9da3, 0.8, 0.05, 0.05, 0, 1.3, -0.75).ln(0x9a9da3, [0, 1.2, -0.8], [0, 0.28, -1.05], 0.07).bx(0x9a9da3, 0.1, 0.1, 0.5, 0.25, 0.35, 0.7);
  b.k(2).bx(0x222226, 0.36, 0.11, 0.8, 0, 1.01, 0.5).bx(0x111111, 0.12, 0.06, 0.06, 0.38, 1.3, -0.75).bx(0x111111, 0.12, 0.06, 0.06, -0.38, 1.3, -0.75);
  wheel(b, 0, 0.27, -1.05, 0.27, 0.13); wheel(b, 0, 0.27, 0.82, 0.27, 0.14);
  if (withRider) rider(b, 0, 1.0, 0.35, jacket, helmet);
  return b.build();
}
function bMoto(paint, withRider, jacket, helmet) {
  const b = new Builder();
  wheel(b, 0, 0.34, -0.95, 0.34, 0.14); wheel(b, 0, 0.34, 0.95, 0.34, 0.16);
  b.k(2).bx(0x222226, 0.26, 0.42, 0.55, 0, 0.52, 0.05).bx(0x1b1b1d, 0.28, 0.1, 0.75, 0, 1.0, 0.35);
  b.k(0).ic(paint, 0.34, 0.32, 0.72, 0, 0.98, -0.28).ic(paint, 0.3, 0.22, 0.55, 0, 1.05, 0.75).ic(paint, 0.3, 0.3, 0.2, 0, 1.12, -0.85);
  b.k(3).ln(0x9a9da3, [-0.08, 1.2, -0.78], [-0.08, 0.36, -0.95], 0.07).ln(0x9a9da3, [0.08, 1.2, -0.78], [0.08, 0.36, -0.95], 0.07).bx(0x9a9da3, 0.72, 0.04, 0.04, 0, 1.3, -0.75).ln(0xb8bbc1, [0.2, 0.4, 0], [0.2, 0.52, 1.1], 0.09).ln(0x3a3a3f, [0, 0.9, 0.2], [0, 0.4, 0.95], 0.06);
  b.k(4).ic(0xfff4d0, 0.22, 0.22, 0.12, 0, 1.12, -0.95).bx(0xff2a2a, 0.18, 0.08, 0.05, 0, 0.98, 1.12);
  if (withRider) rider(b, 0, 1.0, 0.35, jacket, helmet);
  return b.build();
}
const VG = { // shared vehicle geometries (used as background props and as obstacles)
  bus: [bBus(0x1d6fa5, 0xf4c20d, 2), bBus(0xc0392b, 0xf4f1e6, 12), bBus(0x2e8b57, 0xf5e6a8, 21)],
  micro: [bMicrobus(0xf2f2ee, 0x2d6cdf), bMicrobus(0xf2f2ee, 0xd62828), bMicrobus(0xc9dcef, 0xf4f1e6)],
  tempo: [bTempo()], taxi: [bTaxi(0xf1f1ec), bTaxi(0xe9e4cc)],
  scooterR: [bScooter(0xe63946, true, 0x1d6fa5, 0xf4c20d), bScooter(0x2a9d8f, true, 0xd62828, 0xffffff)],
  scooterP: [bScooter(0xe63946, false), bScooter(0x3b6fb5, false)],
  moto: [bMoto(0x1f2937, true, 0x2a2a30, 0xd62828), bMoto(0xc0392b, true, 0x3b6fb5, 0x222222)],
  motoP: [bMoto(0xc0392b, false), bMoto(0x1f2937, false)]
};
function addVeh(g, geo, ry) { const m = new THREE.Mesh(geo, VEHMAT); m.castShadow = SHADOWS; m.rotation.y = ry || 0; g.add(m); }
function bYak() {
  const b = new Builder();
  b.bx(0x2e2018, 1.1, 1.1, 2.1, 0, 1.2, 0).bx(0x24180f, 1.2, 0.5, 2.2, 0, 0.7, 0).bx(0x2e2018, 0.55, 0.6, 0.7, 0, 1.35, -1.35).bx(0x2e2018, 0.7, 0.35, 0.9, 0, 1.9, -0.3);
  b.bx(0xe8dcc0, 1.0, 0.08, 0.08, 0, 1.7, -1.45).bx(0xe8dcc0, 0.08, 0.35, 0.08, 0.5, 1.9, -1.45).bx(0xe8dcc0, 0.08, 0.35, 0.08, -0.5, 1.9, -1.45);
  [-0.35, 0.35].forEach(x => [-0.7, 0.7].forEach(z => b.bx(0x2a1c14, 0.2, 0.6, 0.2, x, 0.3, z)));
  return b.build();
}
function bTree(c1, c2, tr) {
  const b = new Builder();
  b.t(TCY, tr, 0, 1.6, 0, 0.7, 3.2, 0.7).ic(c1, 3.6, 2.8, 3.6, 0, 4.2, 0).ic(c2, 2.4, 2, 2.4, -1.1, 3.6, 0.4).ic(c2, 2.6, 2.2, 2.6, 1.0, 3.8, -0.5).ic(c1, 2.4, 1.8, 2.4, 0.2, 5.3, 0);
  return b.build();
}
function bPine(c1, c2, snow) {
  const b = new Builder();
  b.t(CY7, 0x5a3d26, 0, 0.8, 0, 0.5, 1.6, 0.5);
  [[2.0, 2.6, 3.4], [3.4, 2.4, 2.7], [4.7, 2.2, 2.0], [5.9, 2.0, 1.3]].forEach((t, i) => {
    b.cn(i % 2 ? c2 : c1, t[2], t[1], t[2], 0, t[0], 0);
    if (snow) b.cn(0xf4f8fb, t[2] * 0.58, t[1] * 0.55, t[2] * 0.58, 0, t[0] + t[1] * 0.225, 0);
  });
  return b.build();
}
function bBamboo() {
  const b = new Builder();
  for (let i = 0; i < 7; i++) { const a = i * 0.9, r = 0.5 + (i % 3) * 0.3, x = Math.cos(a) * r, z = Math.sin(a) * r; b.t(CY7, 0x86a843, x, 3.5, z, 0.12, 7, 0.12, rr(-0.1, 0.1), 0, rr(-0.1, 0.1)).ic(0x5f8f3a, 1.2, 0.5, 1.2, x, 6.8, z); }
  return b.build();
}
function bBush(rhodo) {
  const b = new Builder();
  b.ic(0x3f7d34, 1.6, 1.1, 1.6, 0, 0.6, 0).ic(0x4a8c3b, 1.2, 0.9, 1.2, 0.7, 0.5, 0.3).ic(0x3a7030, 1.1, 0.8, 1.1, -0.6, 0.45, -0.3);
  if (rhodo) for (let i = 0; i < 7; i++) b.ic(i % 2 ? 0xd6336c : 0xe8567f, 0.38, 0.38, 0.38, rr(-0.9, 0.9), rr(0.7, 1.2), rr(-0.7, 0.7));
  return b.build();
}
function bRock(snow) {
  const b = new Builder();
  b.ic(0x7d776e, 1.8, 1.1, 1.5, 0, 0.5, 0).ic(0x6d675f, 1.0, 0.7, 0.9, 0.9, 0.3, 0.4);
  if (snow) b.ic(0xf4f8fb, 1.5, 0.5, 1.2, 0, 0.95, 0);
  return b.build();
}
function bCliff(snow) {
  const b = new Builder(), g = snow ? [0x8a8f96, 0x777d85, 0x9aa0a7] : [0x7a7168, 0x6c645b, 0x867c70, 0x5f584f];
  b.bx(g[0], 8, 15, 30, -4, 7.5, 0);
  for (let i = 0; i < 9; i++) {
    const z = -13 + i * 3.3 + rr(-0.8, 0.8), w = rr(1.4, 2.6), h = rr(5, 14), d = rr(2.4, 4.4), cx = rr(-1.2, -0.3);
    b.bx(g[i % g.length], w, h, d, cx, h / 2, z, 0, rr(-0.3, 0.3), rr(-0.06, 0.06));
    if (snow) b.bx(0xf2f6fa, w + 0.05, 0.5, d + 0.05, cx, h + 0.2, z); else b.cn(g[(i + 1) % g.length], w * 1.1, rr(2, 4), d * 0.9, cx, h + 1.2, z);
    if (!snow && i % 2 === 0) b.ic(0x4f7a3a, 1.6, 0.9, 1.6, cx + w / 2, rr(2, 6), z);
  }
  b.bx(snow ? 0xf2f6fa : 0x4a6b36, 8.2, snow ? 1.2 : 0.6, 30.2, -4, 15.2, 0);
  return b.build();
}
function bSlope(snow) {
  const b = new Builder();
  for (let i = 0; i < 4; i++) {
    const h = (i + 1) * 2, col = snow ? (i % 2 ? 0xe9f0f6 : 0xf6f9fc) : (i % 2 ? 0x58803f : 0x4a7237);
    b.bx(col, 6, h, 30, -(6 * i + 3), h / 2, 0).bx(snow ? 0xc9d6e0 : 0x6f6a60, 6.05, 0.4, 30.05, -(6 * i + 3), h - 0.2, 0);
  }
  for (let i = 0; i < 4; i++) b.ic(snow ? 0xdfe8f0 : 0x7d776e, rr(1.5, 2.6), rr(1, 1.6), rr(1.5, 2.4), -rr(2, 22), 8 * 0 + 1 + rr(0, 6), rr(-12, 12));
  return b.build();
}
function bTerrace(a, c) {
  const b = new Builder();
  for (let i = 0; i < 4; i++) {
    const h = (i + 1) * 1.4, x = -(5 * i + 2.5);
    b.bx(i % 2 ? a : c, 5, h, 30, x, h / 2, 0).bx(0x8a8478, 0.3, h, 30.1, -(5 * i) - 0.1, h / 2, 0);
    [-1.2, 0, 1.2].forEach(o => b.bx(0x5e8f2e, 0.3, 0.06, 29, x + o, h + 0.03, 0));
  }
  return b.build();
}
function bWall() {
  const b = new Builder();
  b.bx(0x8a8276, 0.55, 0.8, 30, 0, 0.4, 0).bx(0x7a7266, 0.7, 0.12, 30, 0, 0.86, 0);
  for (let i = 0; i < 14; i++) b.bx(pick([0x9a9285, 0x756e62, 0x8f8776]), 0.6, rr(0.2, 0.35), rr(1.2, 2.4), 0, rr(0.1, 0.7), -14 + i * 2.1);
  return b.build();
}
function bRiver() {
  const b = new Builder();
  b.fl(0x4a9fd6, 6, 30, 0, -0.12, 0).fl(0x7cc4ea, 1.2, 30, 0.6, -0.1, 0);
  for (let i = 0; i < 10; i++) b.ic(0x8d867a, rr(0.6, 1.4), 0.5, rr(0.6, 1.2), pick([-3.2, 3.2]), 0, rr(-14, 14)).fl(0xffffff, 0.15, rr(1, 3), rr(-2, 2), -0.09, rr(-14, 14));
  return b.build();
}
function bBridge() { // suspension footbridge along local x
  const b = new Builder(), N = 12, cab = x => 1.9 + 3.5 * (x / 7) * (x / 7);
  b.bx(0x7a5a38, 14, 0.12, 1.4, 0, 1.6, 0).bx(0x8d867a, 1.5, 1.4, 2, 7.3, 0.7, 0).bx(0x8d867a, 1.5, 1.4, 2, -7.3, 0.7, 0);
  [-7, 7].forEach(x => {
    [-0.7, 0.7].forEach(z => b.bx(0x8a8f94, 0.35, 5.5, 0.35, x, 2.75, z));
    b.bx(0x8a8f94, 0.25, 0.25, 1.6, x, 5.4, 0);
  });
  [-0.7, 0.7].forEach(z => {
    for (let i = 0; i < N; i++) { const x0 = -7 + i * 14 / N, x1 = -7 + (i + 1) * 14 / N; b.ln(0x666b70, [x0, cab(x0), z], [x1, cab(x1), z], 0.07); }
    for (let i = 1; i < N; i++) { const x = -7 + i * 14 / N, h = cab(x) - 1.6; b.bx(0x666b70, 0.04, h, 0.04, x, 1.6 + h / 2, z); }
  });
  flagString(b, [-7, 5.4, 0], [7, 5.4, 0], 0.07);
  return b.build();
}
function bWaterfall() {
  const b = new Builder();
  b.bx(0x6b645b, 8, 13, 10, -4, 6.5, 0).pl(0xeaf5fb, 1.8, 12.6, 0.05, 6.5, 0, PI2).pl(0xcfe8f5, 1.0, 12.6, 0.08, 6.5, 0.2, PI2);
  b.bx(0xf0f8ff, 2.6, 0.6, 2.6, 0.8, 0.3, 0).fl(0x4a9fd6, 6, 6, 1.5, -0.1, 0);
  return b.build();
}
function bLake() { // lake extends along +x
  const b = new Builder();
  b.fl(0xd8c9a2, 1.6, 30, 0.8, -0.05, 0).fl(0x73d0da, 6, 30, 4.5, -0.1, 0).fl(0x3fa9cb, 13.5, 30, 14.25, -0.1, 0).fl(0x2f88b8, 69, 30, 55.5, -0.1, 0);
  for (let i = 0; i < 12; i++) b.fl(0xbff0f5, rr(0.8, 2.4), rr(0.15, 0.4), rr(4, 40), -0.07, rr(-14, 14));
  return b.build();
}
function bBoat(c) {
  const b = new Builder();
  b.bx(c, 0.9, 0.35, 3.6, 0, 0.2, 0).bx(0xffffff, 0.92, 0.08, 3.62, 0, 0.36, 0).bx(c, 0.7, 0.3, 1.0, 0, 0.4, -2.0, 0.35, 0, 0);
  [-0.4, 0.4].forEach(x => [-0.3, 0.9].forEach(z => b.bx(0x5a3a22, 0.05, 1.2, 0.05, x, 1.0, z)));
  b.bx(0xffffff, 1.1, 0.06, 1.6, 0, 1.6, 0.3);
  return b.build();
}
function bDock() {
  const b = new Builder();
  b.bx(0x7a5a38, 8, 0.15, 1.4, 4, 0.05, 0);
  for (let i = 0; i < 4; i++) [-0.6, 0.6].forEach(z => b.cy(0x5a3d26, 0.15, 1.2, 0.15, 1.5 + i * 2, -0.3, z));
  return b.build();
}
function bCafe() { // lakeside bamboo cafe with parasol
  const b = new Builder();
  b.bx(0x7a5a38, 4, 0.2, 4, 0, 0.1, 0);
  [-1.8, 1.8].forEach(x => [-1.8, 1.8].forEach(z => b.bx(0x5a3a22, 0.12, 2.4, 0.12, x, 1.3, z)));
  b.c4(0x9a7b3c, 5, 1.4, 5, 0, 3.2, 0).cy(0x666666, 0.08, 2, 0.08, 0.8, 1.1, 0.8).cn(0xe63946, 1.6, 0.4, 1.6, 0.8, 2.2, 0.8);
  b.bx(0x8b5a2b, 0.8, 0.6, 0.8, -0.8, 0.5, -0.5);
  return b.build();
}
function bLamp() {
  const b = new Builder();
  b.bx(0x30343a, 0.35, 0.5, 0.35, 0, 0.25, 0).bx(0x3b3f45, 0.14, 5, 0.14, 0, 2.5, 0).bx(0x3b3f45, 1.4, 0.1, 0.1, 0.65, 5.0, 0).bx(0xfff2c0, 0.5, 0.15, 0.3, 1.3, 4.95, 0);
  return b.build();
}
function bEpole(tf) { // wires run toward -z (next pole is 15 units ahead)
  const b = new Builder(), ws = [-0.8, 0, 0.8];
  b.k(2).bx(0x8d8d88, 0.22, 6.8, 0.22, 0, 3.4, 0);
  b.k(3).bx(0x4a4a46, 2.0, 0.1, 0.12, 0, 6.3, 0).bx(0x4a4a46, 1.5, 0.1, 0.12, 0, 5.6, 0);
  b.k(0); ws.forEach(x => { b.cy(0xdddddd, 0.1, 0.15, 0.1, x, 6.4, 0); b.ln(0x1a1a1a, [x, 6.35, 0], [x, 5.95, -7.5], 0.03).ln(0x1a1a1a, [x, 5.95, -7.5], [x, 6.35, -15], 0.03); });
  [-0.6, -0.2, 0.2, 0.6].forEach((x, i) => { const sag = 0.35 + (i % 3) * 0.3; b.ln(0x111111, [x, 5.65, 0], [x + 0.2, 5.65 - sag, -7.5], 0.045).ln(0x111111, [x + 0.2, 5.65 - sag, -7.5], [x, 5.65, -15], 0.045); });
  for (let i = 0; i < 3; i++) { const x0 = pick(ws), x2 = pick(ws), sag = rr(0.8, 1.6); b.ln(0x151515, [x0, 5.5, 0], [(x0 + x2) / 2, 5.5 - sag, -7.5], 0.035).ln(0x151515, [(x0 + x2) / 2, 5.5 - sag, -7.5], [x2, 5.5, -15], 0.035); }
  b.ic(0x1a1a1a, 0.5, 0.4, 0.5, 0.2, 5.4, 0);
  if (tf) b.k(4).bx(0x6f747a, 0.7, 1.0, 0.6, 0.45, 5.0, 0).cy(0x6f747a, 0.25, 0.5, 0.25, 0.45, 5.7, 0);
  return b.build();
}
function bXwire() { // cables crossing the street, high above the lanes
  const b = new Builder().k(0);
  for (let c = 0; c < 5; c++) {
    const z = rr(-1.2, 1.2), y0 = 6.6 + rr(0, 0.5), sag = rr(0.5, 1.1), N = 8, f = x => y0 - sag * (1 - (x / 6.4) * (x / 6.4));
    for (let i = 0; i < N; i++) { const a = -6.4 + i * 12.8 / N, a2 = a + 12.8 / N; b.ln(0x151515, [a, f(a), z], [a2, f(a2), z + rr(-0.05, 0.05)], 0.04); }
  }
  return b.build();
}
function bFlagline() { // Tibetan prayer flags strung across the street
  const b = new Builder().k(0), N = 24, y = x => 5.4 + 0.9 * (x / 6.4) * (x / 6.4);
  for (let i = 0; i < N; i++) { const x0 = -6.4 + i * 12.8 / N, x1 = x0 + 12.8 / N; b.ln(0x2a2a2a, [x0, y(x0), 0], [x1, y(x1), 0], 0.05); }
  for (let i = 0; i < N * 2; i++) { const x = -6.2 + i * 12.4 / (N * 2); b.t(PLG, FLAGCOLS[i % 5], x, y(x) - 0.3, rr(-0.05, 0.05), 0.42, 0.5, 1, rr(-0.1, 0.1), rr(-0.5, 0.5), rr(-0.12, 0.12)); }
  return b.build();
}
function bKerb() { // Nepal-style red/white painted kerbstones
  const b = new Builder();
  for (let i = 0; i < 10; i++) b.bx(i % 2 ? 0xf2f2f2 : 0xc0392b, 0.5, 0.35, 2.9, 0, 0.175, -13.5 + i * 3);
  return b.build();
}
function bSnowbank() {
  const b = new Builder();
  for (let i = 0; i < 10; i++) b.ic(i % 2 ? 0xf4f8fb : 0xe6eef4, rr(2, 4), rr(0.5, 0.9), rr(0.9, 1.5), rr(-0.3, 0.3), 0.1, -13.5 + i * 3);
  return b.build();
}
function bRoadsign(i) {
  const b = new Builder();
  b.bx(0x555555, 0.1, 2.6, 0.1, 0, 1.3, 0).bx(0xf4f1ea, 1.9, 0.6, 0.06, 0, 2.5, 0).pl(0xffffff, 1.8, 0.45, 0, 2.5, 0.04, 0, signUV(i));
  return b.build();
}
function bCloud() {
  const b = new Builder();
  b.ic(0xffffff, 14, 6, 9, 0, 0, 0).ic(0xf4f6fa, 10, 5, 7, 7, -0.5, 1).ic(0xffffff, 9, 5, 6, -6, -0.3, -1).ic(0xe9edf2, 12, 3.5, 8, 1, -1.5, 0);
  return b.build();
}

/* ---------- Prop registry + pooling ---------- */
const PR = {};
const defProp = (n, geos, mt) => { PR[n] = geos.map(geo => ({ geo, free: [], mat: mt })); };
defProp('newari', [bNewari(3, 0xa23b2a, 0, 1), bNewari(4, 0x9c4a30, 1, 0), bNewari(3, 0xb3512f, 2, 1), bNewari(5, 0x8f3b2b, 3, 0), bNewari(4, 0xa8482d, 4, 1), bNewari(3, 0x97402c, 5, 0), bNewari(4, 0xa23b2a, 6, 0), bNewari(3, 0xb3512f, 7, 1)]);
defProp('pokhara', [bPokhara(3, 0xf1d9a0, 0xffffff, 12), bPokhara(2, 0xa9d3e0, 0xf4f4f4, 13), bPokhara(3, 0xeab0a6, 0xffffff, 14), bPokhara(2, 0xc4e0a0, 0xf4f4f4, 15)]);
defProp('farm', [bFarm(0xb5532b, 0x8a3a28), bFarm(0x9a7b3c, 0x6e5a30), bFarm(0x8a9097, 0x5e646b)]);
defProp('hamlet', [bHamlet(false), bHamlet(false)]); defProp('hamletS', [bHamlet(true), bHamlet(true)]);
defProp('stupa', [bStupa()]); defProp('pagoda', [bPagoda()]); defProp('stall', [bStall()]);
defProp('microbus', VG.micro, VEHMAT); defProp('bus', VG.bus, VEHMAT); defProp('tempo', VG.tempo, VEHMAT); defProp('taxi', VG.taxi, VEHMAT); defProp('scooterP', VG.scooterP, VEHMAT); defProp('motoP', VG.motoP, VEHMAT); defProp('yak', [bYak()]);
defProp('tree', [bTree(0x3f8a3a, 0x4fa044, 0x6b4a2b), bTree(0x2f7a38, 0x3f8f45, 0x5a3d26), bTree(0x5a9a3a, 0x6fb04a, 0x6b4a2b)]);
defProp('pine', [bPine(0x2e6b3f, 0x275d38, false), bPine(0x34733f, 0x2a6038, false)]);
defProp('pineS', [bPine(0x2e6b3f, 0x275d38, true), bPine(0x34733f, 0x2a6038, true)]);
defProp('bamboo', [bBamboo()]); defProp('bush', [bBush(false), bBush(true), bBush(true)]);
defProp('rock', [bRock(false), bRock(false)]); defProp('rockS', [bRock(true), bRock(true)]);
defProp('cliff', [bCliff(false), bCliff(false), bCliff(false)]); defProp('cliffS', [bCliff(true), bCliff(true), bCliff(true)]);
defProp('slope', [bSlope(false)]); defProp('slopeS', [bSlope(true)]);
defProp('terrace', [bTerrace(0x6faa3c, 0x8bbf4a), bTerrace(0x8bbf4a, 0xc9b94a)]);
defProp('wall', [bWall()]); defProp('river', [bRiver()]); defProp('bridge', [bBridge()]); defProp('waterfall', [bWaterfall()]);
defProp('lake', [bLake()]); defProp('boat', [bBoat(0xd94f2a), bBoat(0x2a7fd9), bBoat(0xf2c94c)]); defProp('dock', [bDock()]); defProp('cafe', [bCafe()]);
defProp('lamp', [bLamp()]); defProp('epole', [bEpole(false), bEpole(false), bEpole(true)]); defProp('flagline', [bFlagline(), bFlagline()]); defProp('xwire', [bXwire(), bXwire()]); defProp('hillock', [bHillock()]); defProp('kerb', [bKerb()]); defProp('snowbank', [bSnowbank()]);
defProp('roadsign', [bRoadsign(16), bRoadsign(17), bRoadsign(18), bRoadsign(19)]); defProp('cloud', [bCloud(), bCloud()]);
/* ---------- XTREME ENERGY DRINK billboard (Kathmandu roadside) ---------- */
function xtremeArt() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d'), FONT = '"Impact","Arial Black","Trebuchet MS",sans-serif';
  let q = g.createLinearGradient(0, 0, 300, 512); q.addColorStop(0, '#1456d6'); q.addColorStop(0.55, '#0a2c95'); q.addColorStop(1, '#051650');
  g.fillStyle = q; g.fillRect(0, 0, 1024, 512);
  q = g.createRadialGradient(835, 250, 10, 835, 250, 330); q.addColorStop(0, 'rgba(120,200,255,.75)'); q.addColorStop(1, 'rgba(120,200,255,0)');
  g.fillStyle = q; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 9; i++) {
    const x0 = -80 + i * 130; g.fillStyle = 'rgba(120,190,255,' + (0.07 + (i % 3) * 0.04) + ')';
    g.beginPath(); g.moveTo(x0, 512); g.lineTo(x0 + 70, 512); g.lineTo(x0 + 330, 0); g.lineTo(x0 + 260, 0); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(255,214,40,.35)'; g.beginPath();
  [[600, 10], [470, 230], [545, 230], [470, 500], [640, 200], [565, 200], [650, 10]].forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(3,14,50,.8)'; g.fillRect(0, 425, 640, 87);
  g.fillStyle = '#ffd21f'; g.font = '900 38px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CHARGE UP \u2022 GO XTREME', 320, 470);
  g.fillStyle = '#bfe3ff'; g.font = '800 30px ' + FONT; g.textAlign = 'left'; g.fillText('POWER \u2022 ENERGY \u2022 FOCUS', 50, 62);
  g.fillStyle = '#e63232'; g.fillRect(44, 368, 520, 10);
  const txt = (t, x, y, size, mw) => {
    g.font = '900 ' + size + 'px ' + FONT;
    while (g.measureText(t).width > mw && size > 20) { size -= 4; g.font = '900 ' + size + 'px ' + FONT; }
    g.save(); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.transform(1, 0, -0.18, 1, 0.18 * y, 0);
    g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = '#04123f'; g.strokeText(t, x, y);
    g.fillStyle = '#ffd21f'; g.fillText(t, x + 5, y + 6); g.fillStyle = '#ffffff'; g.fillText(t, x, y); g.restore();
  };
  txt('XTREME', 44, 255, 190, 560); txt('ENERGY DRINK', 48, 345, 100, 540);
  const can = (cx, cy, s, a) => {
    g.save(); g.translate(cx, cy); g.rotate(a); g.scale(s, s);
    g.shadowColor = 'rgba(0,0,30,.55)'; g.shadowBlur = 24; g.shadowOffsetY = 12;
    const bw = 120, bh = 270, r = 18;
    let k = g.createLinearGradient(-bw / 2, 0, bw / 2, 0); k.addColorStop(0, '#5f7da8'); k.addColorStop(0.3, '#f4f8ff'); k.addColorStop(0.65, '#a9bddb'); k.addColorStop(1, '#4d688f');
    g.fillStyle = k; g.beginPath(); g.moveTo(-bw / 2, -bh / 2 + r); g.lineTo(-bw / 2 + 10, -bh / 2); g.lineTo(bw / 2 - 10, -bh / 2); g.lineTo(bw / 2, -bh / 2 + r);
    g.lineTo(bw / 2, bh / 2 - r); g.lineTo(bw / 2 - 10, bh / 2); g.lineTo(-bw / 2 + 10, bh / 2); g.lineTo(-bw / 2, bh / 2 - r); g.closePath(); g.fill();
    g.shadowColor = 'transparent';
    k = g.createLinearGradient(-bw / 2, 0, bw / 2, 0); k.addColorStop(0, '#071f7a'); k.addColorStop(0.3, '#1f62ff'); k.addColorStop(0.7, '#0b36b8'); k.addColorStop(1, '#051657');
    g.fillStyle = k; g.fillRect(-bw / 2, -bh / 2 + 48, bw, bh - 96);
    g.fillStyle = '#ffd21f'; g.fillRect(-bw / 2, -bh / 2 + 48, bw, 8); g.fillRect(-bw / 2, bh / 2 - 56, bw, 8);
    g.fillStyle = '#e63232'; g.fillRect(-bw / 2, -bh / 2 + 56, bw, 5);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 96px ' + FONT; g.fillText('X', 0, -22); g.font = '900 20px ' + FONT; g.fillText('XTREME', 0, 36); g.font = '700 11px ' + FONT; g.fillText('ENERGY DRINK', 0, 58);
    g.fillStyle = '#c9d4e6'; g.beginPath(); g.ellipse(0, -bh / 2, bw / 2 - 8, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7f8ea8'; g.beginPath(); g.ellipse(0, -bh / 2, bw / 2 - 22, 5, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  can(700, 300, 1.0, -0.14); can(965, 310, 0.95, 0.14); can(835, 255, 1.3, 0.03);
  for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.25 + Math.random() * 0.4) + ')'; g.beginPath(); g.arc(640 + Math.random() * 370, 60 + Math.random() * 400, 2 + Math.random() * 5, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 6; g.strokeRect(8, 8, 1008, 496);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = ANISO; return t;
}
const XTREME_TEX = xtremeArt();
const XTREME_MAT = new THREE.MeshStandardMaterial({ map: XTREME_TEX, emissiveMap: XTREME_TEX, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.55, metalness: 0 });
function bXtremeFrame() { // dark blue frame + two metal poles; origin on the ground, board faces +z
  const b = new Builder(), cy = 5.3, BW = 4.8, BH = 2.6;
  b.k(0).bx(0x061442, BW, BH, 0.12, 0, cy, 0);
  b.bx(0x0a1f5c, BW + 0.1, 0.2, 0.3, 0, cy + BH / 2, 0.08).bx(0x0a1f5c, BW + 0.1, 0.2, 0.3, 0, cy - BH / 2, 0.08);
  b.bx(0x0a1f5c, 0.2, BH, 0.3, -BW / 2, cy, 0.08).bx(0x0a1f5c, 0.2, BH, 0.3, BW / 2, cy, 0.08);
  b.k(4);
  [-1.5, 1.5].forEach(x => { b.cy(0x8d949b, 0.26, 6.1, 0.26, x, 3.05, -0.18); b.bx(0x555a60, 0.7, 0.12, 0.7, x, 0.06, -0.18); });
  b.bx(0x6f767d, 3.4, 0.12, 0.12, 0, 4.4, -0.12).bx(0x6f767d, 3.4, 0.12, 0.12, 0, 6.2, -0.12);
  [-1.6, 0, 1.6].forEach(x => { b.k(4).bx(0x30343a, 0.08, 0.08, 0.55, x, cy + BH / 2 + 0.22, 0.4); b.k(0).bx(0xfff2c0, 0.35, 0.07, 0.2, x, cy + BH / 2 + 0.2, 0.68); });
  return b.build();
}
function bXtremeFace() { const f = new THREE.PlaneGeometry(4.4, 2.2); f.translate(0, 5.3, 0.1); return f; }
defProp('xtremeFrame', [bXtremeFrame()]); defProp('xtremeFace', [bXtremeFace()], XTREME_MAT);
const SWAY = { tree: [0.03, 1.4, 'z'], pine: [0.02, 1.1, 'z'], pineS: [0.015, 1.0, 'z'], bamboo: [0.05, 1.8, 'z'], bush: [0.04, 1.6, 'z'], flagline: [0.06, 2.1, 'x'], boat: [0.05, 1.1, 'b'] };

function put(s, name, x, y, z, ry, sc) {
  const vs = PR[name], v = vs[rnd(vs.length)];
  let m = v.free.pop();
  if (!m) { m = new THREE.Mesh(v.geo, v.mat || WORLDMAT); m.userData.v = v; m.userData.ph = Math.random() * 6; }
  const k = sc || 1;
  m.position.set(x, y, z); m.rotation.set(0, ry || 0, 0); m.scale.set(k, k, k); m.visible = true;
  s.g.add(m); s.items.push(m);
  if (SWAY[name]) { m.userData.sw = SWAY[name]; m.userData.y0 = y; s.sway.push(m); }
  return m;
}
function clearSeg(s) {
  for (const m of s.items) { s.g.remove(m); m.userData.v.free.push(m); m.userData.sw = null; }
  s.items.length = 0; s.sway.length = 0;
}

/* ---------- Zone dressers: called once per side per segment ---------- */
const cloud = (s, y0, y1) => put(s, 'cloud', pick([-1, 1]) * rr(25, 60), rr(y0, y1), rr(-14, 14), 0, rr(0.8, 1.4));
const DRESS = [
  function kathmandu(s, side) {
    put(s, 'newari', side * 11.5, 0, -7, face(side)); put(s, 'newari', side * 11.5, 0, 7, face(side));
    if (chance(0.7)) put(s, 'newari', side * rr(17.5, 19), 0, rr(-7, 7), face(side), rr(1.0, 1.25)); // second row fills the skyline
    put(s, 'epole', side * 6.5, 0.2, -7.5); put(s, 'epole', side * 6.5, 0.2, 7.5);
    if (side < 0) { if (chance(0.75)) put(s, 'flagline', 0, 0, rr(-4, 4)); if (chance(0.7)) put(s, 'xwire', 0, 0, rr(-10, 10)); }
    if (chance(0.45)) put(s, 'stall', side * 8.1, 0.2, rr(-12, 12), face(side));
    if (side > 0 && chance(0.3)) { const bz = rr(-3, 3); put(s, 'xtremeFrame', 7.4, 0.2, bz, -0.96); put(s, 'xtremeFace', 7.4, 0.2, bz, -0.96); }
    if (chance(0.3)) put(s, pick(['microbus', 'bus', 'tempo', 'taxi']), side * 5.2, 0, rr(-11, 11));
    if (chance(0.35)) { const z = rr(-4, 4); put(s, pick(['motoP', 'scooterP']), side * 7.6, 0.2, z, side * PI2); if (chance(0.5)) put(s, 'motoP', side * 7.6, 0.2, z + 0.9, side * PI2); }
    if (chance(0.14)) put(s, 'pagoda', side * rr(25, 33), 0, rr(-8, 8), rr(0, 6.28));
    if (chance(0.12)) put(s, 'stupa', side * rr(24, 32), 0, rr(-8, 8), rr(0, 6.28));
    if (chance(0.05)) { const hx = side * rr(42, 55), hz = rr(-8, 8); put(s, 'hillock', hx, 0, hz); put(s, 'stupa', hx, 11.8, hz, 0, 0.5); }
    if (chance(0.22)) put(s, 'tree', side * 8.7, 0.2, rr(-12, 12), 0, rr(0.8, 1.1));
  },
  function country(s, side) {
    if (chance(1) && Math.random() < 0.55) {
      put(s, 'terrace', side * 15.5, 0, 0, face(side));
      [-1, 1].forEach(k => { if (Math.random() < 0.8) put(s, 'farm', side * rr(11, 13.2), 0, k * 7 + rr(-2, 2), face(side) + rr(-0.1, 0.1)); });
      for (let i = 0; i < 3; i++) { const x = side * rr(17, 36); put(s, 'tree', x, stepY(x, 15.5, 5, 1.4, 4), rr(-14, 14), 0, rr(0.9, 1.4)); }
    } else {
      put(s, 'river', side * 20, 0, 0);
      if (Math.random() < 0.22) put(s, 'bridge', side * 20, 0, rr(-8, 8));
      if (chance(0.12)) put(s, 'waterfall', side * 30, 0, rr(-8, 8), face(side));
      if (Math.random() < 0.6) put(s, 'farm', side * rr(11, 13.2), 0, rr(-9, 9), face(side));
      for (let i = 0; i < 3; i++) put(s, 'tree', side * rr(25, 42), 0, rr(-14, 14), 0, rr(0.9, 1.5));
    }
    if (chance(0.6)) put(s, 'wall', side * 9.6, 0, 0);
    for (let i = 0; i < 2; i++) if (chance(0.6)) put(s, 'tree', side * rr(9.8, 11), 0, rr(-14, 14), 0, rr(0.9, 1.3));
    if (chance(0.35)) put(s, 'bamboo', side * rr(11, 15), 0, rr(-12, 12), 0, rr(0.8, 1.2));
    if (chance(0.5)) put(s, 'bush', side * rr(9.8, 12), 0, rr(-13, 13), rr(0, 6), rr(0.9, 1.4));
    if (side < 0 && chance(0.4)) cloud(s, 26, 42);
  },
  function pokhara(s, side) {
    [-7.5, 7.5].forEach(z => put(s, 'lamp', side * 6.6, 0.2, z, face(side)));
    if (side > 0) {
      put(s, 'lake', 9, 0, 0);
      if (chance(0.6)) put(s, 'boat', rr(14, 40), -0.05, rr(-12, 12), rr(-0.4, 0.4));
      if (chance(0.45)) put(s, 'boat', rr(14, 40), -0.05, rr(-12, 12), rr(-0.4, 0.4));
      if (chance(0.14)) put(s, 'dock', 9.2, 0, rr(-10, 10));
      if (chance(0.28)) put(s, 'cafe', 10.6, 0, rr(-10, 10), Math.PI);
      if (chance(0.5)) put(s, 'tree', rr(9.4, 10.2), 0, rr(-13, 13), 0, rr(0.8, 1.1));
    } else {
      put(s, 'pokhara', -11.5, 0, -7, 0); put(s, 'pokhara', -11.5, 0, 7, 0);
      for (let i = 0; i < 2; i++) if (chance(0.55)) put(s, 'tree', -rr(17, 32), 0, rr(-13, 13), 0, rr(0.9, 1.4));
      if (chance(0.4)) put(s, 'bush', -rr(9.5, 10), 0, rr(-13, 13), rr(0, 6));
      if (chance(0.35)) cloud(s, 28, 44);
    }
  },
  function highway(s, side) {
    put(s, 'kerb', side * 6.35, 0.2, 0);
    const cliff = Math.random() < 0.5;
    if (cliff) { put(s, 'cliff', side * 10.2, 0, 0, face(side)); if (chance(0.2)) put(s, 'waterfall', side * 9.7, 0, rr(-8, 8), face(side)); }
    else { put(s, 'slope', side * 10.5, 0, 0, face(side)); if (chance(0.2)) put(s, 'hamlet', side * 19.5, stepY(19.5, 10.5, 6, 2, 4), rr(-8, 8), face(side)); }
    for (let i = 0; i < 4; i++) {
      let x = side * rr(11, 34); if (cliff && Math.abs(x) < 22) x = side * rr(22, 36);
      put(s, 'pine', x, cliff ? 0 : stepY(x, 10.5, 6, 2, 4), rr(-14, 14), 0, rr(0.9, 1.6));
    }
    if (chance(0.45)) put(s, 'rock', side * rr(7, 8.8), 0.2, rr(-13, 13), rr(0, 6), rr(0.5, 1));
    if (chance(0.18)) put(s, 'roadsign', side * 8.2, 0.2, rr(-12, 12));
    if (chance(0.06)) put(s, 'stupa', side * 8.4, 0.2, rr(-8, 8), 0, 0.4);
    if (side < 0 && chance(0.5)) cloud(s, 22, 38);
  },
  function high(s, side) {
    put(s, 'snowbank', side * 6.6, 0.2, 0);
    const cliff = Math.random() < 0.5;
    if (cliff) put(s, 'cliffS', side * 10.2, 0, 0, face(side)); else { put(s, 'slopeS', side * 10.5, 0, 0, face(side)); if (chance(0.16)) put(s, 'hamletS', side * 19.5, stepY(19.5, 10.5, 6, 2, 4), rr(-8, 8), face(side)); }
    for (let i = 0; i < 4; i++) {
      let x = side * rr(11, 34); if (cliff && Math.abs(x) < 22) x = side * rr(22, 36);
      put(s, 'pineS', x, cliff ? 0 : stepY(x, 10.5, 6, 2, 4), rr(-14, 14), 0, rr(0.9, 1.6));
    }
    if (chance(0.5)) put(s, 'rockS', side * rr(7, 9), 0.2, rr(-13, 13), rr(0, 6), rr(0.5, 1));
    if (chance(0.12)) put(s, 'stupa', side * 8.4, 0.2, rr(-8, 8), 0, 0.4);
    if (chance(0.22)) put(s, 'yak', side * 7.6, 0.2, rr(-12, 12), rr(0, 6.28));
    if (side < 0 && chance(0.3)) cloud(s, 18, 32);
  }
];
function dressSeg(s) { // every segment is dressed for the locked world
  clearSeg(s);
  [-1, 1].forEach(side => DRESS[WORLD](s, side));
}

/* ---------- Sky, ground, mountains, hills ---------- */
const SKY_R = 320, skyGeo = new THREE.SphereGeometry(SKY_R, 16, 10);
skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -10; sky.frustumCulled = false; S.add(sky);
function paintSky(top, hor) {
  const pa = skyGeo.attributes.position, ca = skyGeo.attributes.color;
  for (let i = 0; i < pa.count; i++) {
    const h = Math.max(0, pa.getY(i) / SKY_R), t = Math.min(1, h / 0.6), k = t * t * (3 - 2 * t);
    ca.setXYZ(i, mix(hor.r, top.r, k), mix(hor.g, top.g, k), mix(hor.b, top.b, k));
  }
  ca.needsUpdate = true;
}
const walkTex = mkTex(256, 256, (x, w, h) => {
  x.fillStyle = '#d6d2c8'; x.fillRect(0, 0, w, h); speckle(x, w, h, 3000, 0.09);
  for (let i = 0; i < 6; i++) { const cx = rnd(w), cy = rnd(h), g = x.createRadialGradient(cx, cy, 0, cx, cy, 40); g.addColorStop(0, 'rgba(60,50,40,.18)'); g.addColorStop(1, 'rgba(60,50,40,0)'); x.fillStyle = g; x.fillRect(cx - 40, cy - 40, 80, 80); }
  x.strokeStyle = 'rgba(50,46,40,.6)'; x.lineWidth = 3; x.beginPath(); [0, 128].forEach(p => { x.moveTo(p, 0); x.lineTo(p, h); x.moveTo(0, p); x.lineTo(w, p); }); x.stroke();
}, [1, 10]);
const groundTex = mkTex(256, 256, (x, w, h) => {
  x.fillStyle = '#dcdcdc'; x.fillRect(0, 0, w, h); speckle(x, w, h, 4000, 0.1);
  for (let i = 0; i < 14; i++) { const cx = rnd(w), cy = rnd(h), g = x.createRadialGradient(cx, cy, 0, cx, cy, 50); g.addColorStop(0, 'rgba(0,0,0,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx - 50, cy - 50, 100, 100); }
}, [60, 60]);
const groundMat = new THREE.MeshLambertMaterial({ map: groundTex, color: 0x8d8a82 });
const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, bumpMap: walkTex, bumpScale: 0.6, color: 0x9a8f80, roughness: 0.95, metalness: 0 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.25; S.add(ground);

const MT = new THREE.Group(); S.add(MT);
const CN5 = new THREE.ConeGeometry(0.5, 1, 5);
const mtnBody = new THREE.MeshLambertMaterial({ color: 0x6f8a76, fog: false }), mtnSnow = new THREE.MeshLambertMaterial({ color: 0xffffff, fog: false }), hillMat = new THREE.MeshLambertMaterial({ color: 0x7f9a6a });
const peaks = [];
function addPeak(x, z, r, h) {
  const g = new THREE.Group(); g.position.set(x, -2, z);
  const m = new THREE.Mesh(CN5, mtnBody); m.scale.set(r * 2, h, r * 2); m.position.y = h / 2;
  const sn = new THREE.Mesh(CN5, mtnSnow); sn.scale.set(r * 0.62, h * 0.3, r * 0.62); sn.position.y = h * 0.85;
  g.add(m, sn); MT.add(g); peaks.push(g);
}
for (let i = 0; i < 14; i++) addPeak(-270 + i * 40 + rr(-10, 10), rr(-25, 15), rr(24, 34), rr(38, 70));
addPeak(70, -30, 15, 85); addPeak(84, -28, 12, 78); // Machapuchare "fish-tail"
for (let i = 0; i < 12; i++) {
  const hm = new THREE.Mesh(SG, hillMat), w = rr(50, 80);
  hm.scale.set(w, rr(18, 34), rr(40, 60)); hm.position.set((i % 2 ? 1 : -1) * (65 + Math.floor(i / 2) * 38 + rr(0, 10)), -6, 70 + rr(-15, 15)); MT.add(hm);
}

/* ---------- Particles (dust / pollen -> snow) ---------- */
const NP = lowEnd ? 140 : 260, ppos = new Float32Array(NP * 3);
for (let i = 0; i < NP; i++) { ppos[i * 3] = rr(-14, 14); ppos[i * 3 + 1] = rr(0, 14); ppos[i * 3 + 2] = rr(-30, 4); }
const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
const pm = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.2, depthWrite: false });
const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; S.add(pts);
function updateParticles(dt, pz) {
  const sn = ENV.snow; pm.opacity = 0.16 + 0.7 * sn; pm.size = 0.13 + 0.08 * sn;
  const fall = -0.25 + 2.6 * sn, run = state === 'play' ? spd * 0.7 : 0;
  pts.position.set(0, 0, pz);
  for (let i = 0; i < NP; i++) {
    const j = i * 3;
    ppos[j] += Math.sin(time * 0.8 + i) * dt * 0.6 + dt * sn * 1.2; ppos[j + 1] -= fall * dt; ppos[j + 2] += run * dt;
    if (ppos[j + 1] < 0 || ppos[j + 1] > 14 || ppos[j + 2] > 5) {
      const far = ppos[j + 2] > 5;
      ppos[j] = rr(-14, 14); ppos[j + 1] = fall > 0 ? 14 : 0; ppos[j + 2] = far ? rr(-34, -20) : rr(-30, 4);
    }
  }
  pg.attributes.position.needsUpdate = true;
}

/* ---------- Zone announcement banner (created in JS, no HTML change needed) ---------- */
const bst = document.createElement('style');
bst.textContent = '#zoneBanner{position:fixed;left:50%;top:11%;transform:translateX(-50%) translateY(-12px);z-index:6;pointer-events:none;text-align:center;opacity:0;transition:opacity .6s ease,transform .6s ease;width:92vw;max-width:560px}' +
  '#zoneBanner.on{opacity:1;transform:translateX(-50%) translateY(0)}' +
  '#zoneBanner .zt{font:800 clamp(18px,5.6vw,30px)/1.15 "Trebuchet MS",system-ui,sans-serif;letter-spacing:.14em;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.65),0 0 2px rgba(0,0,0,.8)}' +
  '#zoneBanner .zs{margin-top:6px;font:600 clamp(14px,4.2vw,20px) "Noto Sans Devanagari","Mangal",sans-serif;color:#ffd98a;text-shadow:0 2px 8px rgba(0,0,0,.7)}' +
  '#zoneBanner .zl{height:2px;width:0;margin:8px auto 0;background:linear-gradient(90deg,transparent,#ffd98a,transparent);transition:width .8s ease}' +
  '#zoneBanner.on .zl{width:80%}';
document.head.appendChild(bst);
const banner = document.createElement('div'); banner.id = 'zoneBanner';
const zt = document.createElement('div'), zs = document.createElement('div'), zl = document.createElement('div');
zt.className = 'zt'; zs.className = 'zs'; zl.className = 'zl'; banner.append(zt, zs, zl); document.body.appendChild(banner);
function hideZone() { clearTimeout(bannerTO); banner.classList.remove('on'); }
function showZone(i) {
  const z = ZONES[i % 5]; zt.textContent = z.title; zs.textContent = z.sub;
  banner.classList.remove('on'); void banner.offsetWidth; banner.classList.add('on');
  clearTimeout(bannerTO); bannerTO = setTimeout(hideZone, 3400);
}

/* ---------- Sky reflection map + vignette / colour grade ---------- */
const envScene = new THREE.Scene(), envGeo = new THREE.SphereGeometry(50, 24, 12);
envGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(envGeo.attributes.position.count * 3), 3));
envScene.add(new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
let pmrem = null, envRT = null; try { pmrem = new THREE.PMREMGenerator(R); } catch (e) { pmrem = null; }
const SUNDIR = new THREE.Vector3(12, 22, 10).normalize();
function buildEnvMap(top, hor, sunC) {
  if (!pmrem) return;
  try {
    const pa = envGeo.attributes.position, ca = envGeo.attributes.color;
    for (let i = 0; i < pa.count; i++) {
      _v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).divideScalar(50);
      const h = Math.max(0, _v.y), t = Math.min(1, h / 0.6), k = t * t * (3 - 2 * t), g = Math.pow(Math.max(0, _v.dot(SUNDIR)), 24) * 2.5, d = _v.y < 0 ? 0.55 : 1;
      ca.setXYZ(i, (mix(hor.r, top.r, k) + sunC.r * g) * d, (mix(hor.g, top.g, k) + sunC.g * g) * d, (mix(hor.b, top.b, k) + sunC.b * g) * d);
    }
    ca.needsUpdate = true;
    const rt = pmrem.fromScene(envScene, 0.02); if (envRT) envRT.dispose(); envRT = rt; envTex = rt.texture;
    ENVMATS.forEach(m => { if (!m.envMap) m.needsUpdate = true; m.envMap = envTex; });
  } catch (e) { /* reflections are optional */ }
}
const vig = document.createElement('div'); vig.id = 'vig';
vig.style.cssText = 'position:fixed;inset:0;pointer-events:none';
$('c').insertAdjacentElement('afterend', vig);
const GRADE = ['rgba(255,170,90,.07)', 'rgba(255,240,180,.04)', 'rgba(255,230,200,.03)', 'rgba(150,180,220,.06)', 'rgba(170,200,255,.07)'];
function setGrade(zi) { vig.style.background = 'radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 55%,rgba(20,10,0,.3) 100%),linear-gradient(' + GRADE[zi] + ',' + GRADE[zi] + ')'; }

/* ---------- Atmosphere blending ---------- */
const _c2 = new THREE.Color();
function applyEnv(zi, t) {
  const za = ZONES[zi % 5], zb = ZONES[(zi + 1) % 5];
  const top = _c2.copy(za.top).lerp(zb.top, t); const topC = top.clone();
  const hor = _c2.copy(za.hor).lerp(zb.hor, t);
  paintSky(topC, hor); S.background.copy(hor); S.fog.color.copy(hor);
  S.fog.near = mix(za.fogN, zb.fogN, t); S.fog.far = mix(za.fogF, zb.fogF, t);
  hemi.color.copy(za.hemiS).lerp(zb.hemiS, t); hemi.groundColor.copy(za.hemiG).lerp(zb.hemiG, t); hemi.intensity = mix(za.hemiI, zb.hemiI, t);
  sun.color.copy(za.sun).lerp(zb.sun, t); sun.intensity = mix(za.sunI, zb.sunI, t);
  groundMat.color.copy(za.ground).lerp(zb.ground, t); walkMat.color.copy(za.walk).lerp(zb.walk, t); roadMat.color.copy(za.road).lerp(zb.road, t);
  mtnBody.color.copy(za.mtnBody).lerp(zb.mtnBody, t).lerp(hor, 0.3);
  mtnSnow.color.copy(mtnBody.color).lerp(WHITE, mix(za.snowAmt, zb.snowAmt, t));
  hillMat.color.copy(za.hills).lerp(zb.hills, t);
  const mh = mix(za.mtnH, zb.mtnH, t); for (const g of peaks) g.scale.y = mh;
  ENV.snow = mix(za.snowFall, zb.snowFall, t);
  R.toneMappingExposure = mix(za.exp, zb.exp, t); setGrade(zi % 5);
  buildEnvMap(topC, hor, sun.color);
}
function updateEnv() { if (ENV.key !== WORLD) { ENV.key = WORLD; applyEnv(WORLD, 0); } }
function updateSway() {
  for (const s of segs) for (const m of s.sway) {
    const w = m.userData.sw, a = Math.sin(time * w[1] + m.userData.ph) * w[0];
    if (w[2] === 'z') m.rotation.z = a; else if (w[2] === 'x') m.rotation.x = a;
    else { m.rotation.z = a; m.position.y = m.userData.y0 + Math.sin(time * w[1] * 1.3 + m.userData.ph) * 0.06; }
  }
}
function updateEnvironment(dt, pz) { updateEnv(); updateSway(); updateParticles(dt, pz); }

/* ---------- WORLD SEGMENTS (road, kerbs, NPCs stay; dressing is procedural) ---------- */
const SEG = 30, NSEG = 7;
const roadTex = mkTex(512, 640, (x, w, h) => {
  x.fillStyle = '#4a4a50'; x.fillRect(0, 0, w, h); speckle(x, w, h, 9000, 0.1);
  const U = w / 12;
  [-2.2, 0, 2.2].forEach(l => { const u = (6 + l) * U, g = x.createLinearGradient(u - 40, 0, u + 40, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(u - 40, 0, 80, h); });
  for (let i = 0; i < 6; i++) { const cx = (6 + pick([-2.2, 0, 2.2]) + rr(-0.4, 0.4)) * U, cy = rr(0, h), g = x.createRadialGradient(cx, cy, 0, cx, cy, 26); g.addColorStop(0, 'rgba(8,8,10,.35)'); g.addColorStop(1, 'rgba(8,8,10,0)'); x.fillStyle = g; x.fillRect(cx - 26, cy - 26, 52, 52); }
  [0, w - 36].forEach((x0, i) => { const g = x.createLinearGradient(i ? w : 0, 0, i ? w - 36 : 36, 0); g.addColorStop(0, 'rgba(150,125,90,.32)'); g.addColorStop(1, 'rgba(150,125,90,0)'); x.fillStyle = g; x.fillRect(x0, 0, 36, h); });
  for (let i = 0; i < 4; i++) { const pw = rr(40, 110), pq = rr(30, 80), qx = rr(40, w - 150), qy = rr(0, h - 90); x.fillStyle = 'rgba(28,28,32,.4)'; x.fillRect(qx, qy, pw, pq); x.strokeStyle = 'rgba(10,10,12,.5)'; x.lineWidth = 1.5; x.strokeRect(qx, qy, pw, pq); }
  x.strokeStyle = 'rgba(12,12,15,.65)'; x.lineWidth = 1.3;
  for (let i = 0; i < 9; i++) { let cx = rr(20, w - 20), cy = rr(0, h); x.beginPath(); x.moveTo(cx, cy); for (let k = 0; k < 7; k++) { cx += rr(-14, 14); cy += rr(6, 22); x.lineTo(cx, cy); } x.stroke(); }
  x.fillStyle = '#e4dfcc';
  [-1.1, 1.1].forEach(l => { for (let k = 0; k < 3; k++) x.fillRect((6 + l) * U - 3, k * h / 3 + 6, 6, h / 6 - 6); }); // 2.5 m dashes
  x.fillRect(0.45 * U - 3, 0, 6, h); x.fillRect(11.55 * U - 3, 0, 6, h);                                         // solid edge lines
  for (let i = 0; i < 260; i++) { x.fillStyle = 'rgba(70,70,76,' + (0.4 + Math.random() * 0.5) + ')'; x.fillRect((6 + pick([-1.1, 1.1, -5.55, 5.55])) * U - 4 + rnd(8), rnd(h), 1 + rnd(3), 1 + rnd(5)); } // worn paint
}, [1, SEG / 15]);
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, bumpMap: roadTex, bumpScale: 0.8, roughness: 0.92, metalness: 0, envMapIntensity: 0.25 });
ENVMATS.push(roadMat);
const ROADG = new THREE.BoxGeometry(12, 0.2, SEG);
const segs = [], npcs = [];
function mkSeg() {
  const g = new THREE.Group(), s = { g, items: [], sway: [] };
  const road = new THREE.Mesh(ROADG, roadMat); road.position.y = -0.1; road.receiveShadow = true; g.add(road);
  [-7.5, 7.5].forEach(x => { const w = new THREE.Mesh(BG, walkMat); w.scale.set(3, 0.4, SEG); w.position.set(x, 0, 0); g.add(w); });
  [-1, 1].forEach(side => {
    const n = new THREE.Group(); n.position.set(side * 7.5, 0.2, (Math.random() - 0.5) * 20);
    B(pick([0xd62828, 0x1d6fa5, 0x2a9d8f, 0xf77f00]), 0.7, 1, 0.4, 0, 1, 0, n); Sp(0xc98f64, 0.5, 0.5, 0.5, 0, 1.75, 0, n);
    n.userData.ph = Math.random() * 6; g.add(n); npcs.push(n);
  });
  S.add(g); return s;
}
for (let i = 0; i < NSEG; i++) segs.push(mkSeg());

/* ---------- OBSTACLES (pooled) ---------- */
const OT_OLD = [
  { n: 'cow', oy1: 1.4, hw: 0.7, hd: 1.1, m: 'MOO-ve it, bhai! 🐄', b: g => { B(0xf4f1ea, 1.1, 0.9, 2, 0, 0.9, 0, g); B(0x222222, 0.5, 0.5, 0.6, 0.3, 1.1, 0.4, g); B(0xf4f1ea, 0.6, 0.6, 0.7, 0, 1.3, -1.2, g); }, u: (o, t) => { o.mesh.position.x = o.x + Math.sin(t * 1.5 + o.z) * 0.7; } },
  { n: 'cart', oy1: 1.3, hw: 0.6, hd: 0.7, v: 5, m: 'Runaway shopping cart! 🛒', b: g => { B(0xb8c0c8, 1, 0.7, 1.3, 0, 0.9, 0, g); B(0x333333, 1, 0.1, 0.1, 0, 0.3, 0.55, g); } },
  { n: 'momo', oy1: 1.5, hw: 0.7, hd: 0.7, m: 'GIANT MOMO! 🥟', b: g => { Sp(0xf8efe0, 1.6, 1.3, 1.6, 0, 0.7, 0, g); Sp(0xe6d6b8, 0.5, 0.3, 0.5, 0, 1.35, 0, g); }, u: (o, t) => { o.mesh.scale.y = 1 + Math.sin(t * 6) * 0.07; } },
  { n: 'cup', oy1: 1.4, hw: 0.6, hd: 0.6, m: 'Giant chai cup! ☕', b: g => { Cy(0xfafafa, 1.2, 1.4, 1.2, 0, 0.7, 0, g); Cy(0x8b5a2b, 1, 0.1, 1, 0, 1.38, 0, g); B(0xfafafa, 0.3, 0.7, 0.15, 0.7, 0.8, 0, g); } },
  { n: 'tire', oy1: 1.2, hw: 0.6, hd: 0.6, v: 7, m: 'Rolling tyre! 🛞', b: g => { const t = Cy(0x1a1a1a, 1.2, 0.5, 1.2, 0, 0.6, 0, g); t.rotation.z = Math.PI / 2; }, u: o => { o.mesh.children[0].rotation.x -= 0.15; } },
  { n: 'scooter', oy1: 1.7, hw: 0.5, hd: 0.9, v: 10, m: 'Crazy scooter wala! 🛵', b: g => addVeh(g, pick(VG.scooterR), Math.PI) },
  { n: 'bus', oy1: 3.4, hw: 1.15, hd: 2.9, m: 'Local bus, no brakes! 🚌', b: g => addVeh(g, pick(VG.bus)) },
  { n: 'slipper', oy0: 1.0, oy1: 1.6, hw: 0.8, hd: 0.5, m: 'Flying chappal! 🩴', b: g => { B(0x2a9d8f, 0.5, 0.1, 1.3, 0, 1.3, 0, g); B(0xffffff, 0.45, 0.12, 0.3, 0, 1.33, -0.2, g); }, u: (o, t) => { o.mesh.rotation.y = t * 7; } },
  { n: 'bucket', oy0: 1.0, oy1: 2.2, hw: 0.5, hd: 0.5, m: 'Falling bucket! 🪣', b: g => { Cy(0x1d6fa5, 0.9, 0.8, 0.9, 0, 1.6, 0, g); B(0x444444, 0.05, 1.5, 0.05, 0, 2.6, 0, g); }, u: (o, t) => { o.mesh.rotation.z = Math.sin(t * 4) * 0.25; } },
  { n: 'dancer', oy1: 1.5, hw: 0.5, hd: 0.5, m: 'Uncle is dancing! 🕺', b: g => { B(0x6a4c93, 0.7, 1, 0.4, 0, 0.9, 0, g); Sp(0xc98f64, 0.5, 0.5, 0.5, 0, 1.6, 0, g); }, u: (o, t) => { o.mesh.position.y = Math.abs(Math.sin(t * 8)) * 0.3; o.mesh.rotation.y = Math.sin(t * 5) * 0.8; } },
  { n: 'micro', oy1: 3.0, hw: 0.95, hd: 2.3, m: 'Microbus, full of passengers! 🚐', b: g => addVeh(g, pick(VG.micro)) },
  { n: 'taxi', oy1: 1.8, hw: 0.8, hd: 1.85, m: 'Taxi! Taxi! 🚕', b: g => addVeh(g, pick(VG.taxi)) },
  { n: 'moto', oy1: 1.7, hw: 0.45, hd: 0.95, v: 12, m: 'Motorbike overtaking! 🏍️', b: g => addVeh(g, pick(VG.moto), Math.PI) },
  { n: 'tempo', oy1: 2.4, hw: 0.75, hd: 1.6, m: 'Safa tempo, silent but sneaky! 🛺', b: g => addVeh(g, VG.tempo[0]) } 
];
  /* ---------- REALISTIC NEPALI STREET OBSTACLES ---------- */
const BRK = [0xa94a2c, 0x9c4128, 0xb5532f, 0xa04526];
function addGeo(g, geo, mt, ry) { const m = new THREE.Mesh(geo, mt || WORLDMAT); m.castShadow = SHADOWS; m.rotation.y = ry || 0; g.add(m); return m; }

function bBarricade() { // orange/white road-works barrier on A-frame legs
  const b = new Builder().k(4);
  [-0.85, 0.85].forEach(x => b.ln(0x3a3d42, [x, 0, -0.38], [x, 1.08, 0], 0.07).ln(0x3a3d42, [x, 0, 0.38], [x, 1.08, 0], 0.07));
  b.k(0);
  [0.62, 0.95].forEach(y => { for (let i = 0; i < 8; i++) b.bx(i % 2 ? 0xf5f3ee : 0xf26a1b, 0.25, 0.24, 0.07, -0.875 + i * 0.25, y, 0.02); });
  b.bx(0x2b2b2b, 0.16, 0.05, 0.16, 0.75, 1.1, 0).bx(0xffb21a, 0.12, 0.12, 0.12, 0.75, 1.19, 0);
  return b.build();
}
function bMirrors() { // wing mirrors for parked two-wheelers (vehicle kinds: 1 glass, 2 rubber, 3 chrome)
  const b = new Builder();
  [-1, 1].forEach(s => {
    b.k(3).ln(0x9a9da3, [s * 0.34, 1.3, -0.76], [s * 0.44, 1.62, -0.7], 0.035);
    b.k(2).bx(0x1c1c1e, 0.17, 0.11, 0.04, s * 0.45, 1.68, -0.69);
    b.k(1).bx(0xb9d3e6, 0.13, 0.08, 0.02, s * 0.45, 1.68, -0.67);
  });
  return b.build();
}
function crateBox(b, x, y, z) { // open slatted wooden crate 0.9 x 0.5 x 0.65
  const cw = 0.9, cd = 0.65;
  b.k(3).bx(0x8a5a2e, cw, 0.04, cd, x, y + 0.02, z);
  [0.14, 0.36].forEach(yy => [-1, 1].forEach(s => {
    b.bx(0x9a6a38, cw, 0.16, 0.03, x, y + yy, z + s * (cd / 2 - 0.015)).bx(0x9a6a38, 0.03, 0.16, cd, x + s * (cw / 2 - 0.015), y + yy, z);
  }));
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => b.bx(0x6e4524, 0.06, 0.5, 0.06, x + sx * (cw / 2 - 0.03), y + 0.25, z + sz * (cd / 2 - 0.03))));
  b.k(0).bx(0x3b2a1c, cw - 0.08, 0.34, cd - 0.08, x, y + 0.2, z);
}
function produce(b, type, x, t, z) { // t = rim height of the crate
  b.k(0);
  if (type === 0) { for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.ic(pick([0xd63a2a, 0xc92f22, 0xe24632]), 0.25, 0.23, 0.25, x - 0.27 + i * 0.27, t - 0.05, z - 0.14 + j * 0.28); }
  else if (type === 1) { for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.ic(pick([0xb89968, 0xa8895a, 0xc2a577]), 0.3, 0.2, 0.24, x - 0.27 + i * 0.27, t - 0.07, z - 0.14 + j * 0.28); }
  else { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const cx = x - 0.21 + i * 0.42, cz = z - 0.15 + j * 0.3; b.ic(0x5f9a40, 0.44, 0.16, 0.42, cx, t - 0.1, cz).ic(0xf3ecd2, 0.3, 0.26, 0.3, cx, t + 0.02, cz); } }
}
function bCrates(o) { // vegetable market pile: o = produce type for [left, right, top]
  const b = new Builder();
  crateBox(b, 0, 0, -0.33); crateBox(b, 0, 0, 0.33); crateBox(b, 0, 0.5, 0);
  produce(b, o[0], 0, 0.42, -0.33); produce(b, o[1], 0, 0.42, 0.33); produce(b, o[2], 0, 0.92, 0);
  return b.build();
}
function bBricks() { // stacked red clay bricks, 4 x 4 per layer, 8 layers
  const b = new Builder().k(0);
  b.bx(0x4a2012, 1.06, 0.62, 0.54, 0, 0.34, 0);
  for (let L = 0; L < 8; L++) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (L === 7 && (i + j) % 2) continue;
    b.bx(pick(BRK), 0.265, 0.09, 0.135, -0.4125 + i * 0.275 + rr(-0.008, 0.008), 0.046 + L * 0.092, -0.2175 + j * 0.145 + rr(-0.008, 0.008), 0, rr(-0.04, 0.04), 0);
  }
  [[-0.2, 0.2, 0.3], [0.25, -0.1, -0.5]].forEach(p => b.bx(pick(BRK), 0.265, 0.09, 0.135, p[0], 0.79, p[1], 0, p[2], 0));
  return b.build();
}
const PILEP = [[0.001, 0], [0.92, 0], [0.78, 0.13], [0.52, 0.4], [0.26, 0.67], [0.09, 0.86], [0.001, 0.92]];
function bPile(col, peb) { // sand or gravel heap
  const b = new Builder().k(0);
  b.lt(col, PILEP, 0, 0, 0, 1, 1, 1, 0, 14).lt(col, PILEP, 0.45, 0, 0.3, 0.5, 0.5, 0.5, 0, 12);
  for (let i = 0; i < 18; i++) { const a = rr(0, 6.28), r = rr(0.1, 0.85), y = Math.max(0.03, 0.95 - r * 1.05), s = rr(0.08, 0.17); b.ic(pick(peb), s, s * 0.7, s, Math.cos(a) * r, y * 0.92, Math.sin(a) * r); }
  return b.build();
}
const DOKOP = [[0.001, 0], [0.15, 0], [0.22, 0.22], [0.3, 0.45], [0.34, 0.6], [0.35, 0.65], [0.31, 0.66], [0.27, 0.45], [0.19, 0.22], [0.12, 0.05], [0.001, 0.05]];
function doko(b, x, z, s, fill) { // woven bamboo basket
  b.k(3).lt(0xc8a060, DOKOP, x, 0, z, s, s, s, 0, 14);
  [0.12, 0.28, 0.44, 0.6].forEach(y => { const d = 2 * (0.15 + 0.32 * y) + 0.03; b.t(CY16, 0x7a5a28, x, y * s, z, d * s, 0.035 * s, d * s); });
  if (fill) b.k(0).ic(fill, 0.5 * s, 0.26 * s, 0.5 * s, x, 0.6 * s, z);
}
function bDokos(f1, f2) { const b = new Builder(); doko(b, -0.45, 0.25, 1.1, f1); doko(b, 0.42, 0.15, 1.05, f2); doko(b, 0, -0.45, 1.15, 0); return b.build(); }
const KETP = [[0.001, 0], [0.2, 0], [0.24, 0.08], [0.23, 0.24], [0.15, 0.34], [0.06, 0.38], [0.001, 0.4]];
function bChiya() { // roadside chiya pasal, front faces +z
  const b = new Builder();
  b.k(3).bx(0x7a4a2a, 1.6, 0.86, 0.8, 0, 0.43, 0).bx(0x8a5a30, 1.4, 0.55, 0.02, 0, 0.45, 0.41).bx(0xcfc7b8, 1.7, 0.06, 0.92, 0, 0.89, 0);
  [-0.82, 0.82].forEach(x => [-0.46, 0.46].forEach(z => b.bx(0x5a3a22, 0.08, 2.2, 0.08, x, 1.1, z)));
  b.k(4).bx(0x8d949b, 1.95, 0.05, 1.25, 0, 2.27, 0, 0.12, 0, 0);
  b.k(0).bx(0x2d6cb5, 1.7, 1.2, 0.03, 0, 1.5, -0.47).pl(0xffffff, 1.4, 0.34, 0, 1.95, 0.5, 0, signUV(0));
  b.ln(0x333333, [-0.75, 1.7, 0.48], [0.75, 1.7, 0.48], 0.02);
  for (let i = 0; i < 7; i++) b.bx(pick(GCOL), 0.14, 0.24, 0.02, -0.69 + i * 0.23, 1.55, 0.48);
  b.bx(0x2b2b2b, 0.5, 0.1, 0.4, -0.45, 0.97, 0);
  b.k(4).lt(0xc3c7cc, KETP, -0.45, 1.02, 0, 1, 1, 1, 0, 14).ln(0xc3c7cc, [-0.25, 1.2, 0], [-0.06, 1.38, 0], 0.05).ln(0xc3c7cc, [-0.66, 1.18, 0], [-0.7, 1.38, 0], 0.04).ln(0xc3c7cc, [-0.7, 1.38, 0], [-0.55, 1.45, 0], 0.04);
  b.k(0).ic(0x2b2b2b, 0.08, 0.08, 0.08, -0.45, 1.44, 0).bx(0xb8b8b8, 0.7, 0.02, 0.3, 0.5, 0.93, 0.15);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) { const cx = 0.28 + i * 0.15, cz = 0.08 + r * 0.14; b.cy(0xe9e1cf, 0.09, 0.1, 0.09, cx, 0.99, cz).cy(0xa8561a, 0.075, 0.012, 0.075, cx, 1.036, cz); }
  [0.2, 0.55].forEach(x => b.cy(0xdfeaf0, 0.2, 0.3, 0.2, x, 1.09, -0.22).cy(0xe8dfc8, 0.17, 0.2, 0.17, x, 1.04, -0.22).cy(0xd62828, 0.2, 0.04, 0.2, x, 1.26, -0.22));
  return b.build();
}
function drum(b, x, z) { // 200 L blue plastic water drum
  b.k(0).t(CY16, 0x1d5fb0, x, 0.45, z, 0.58, 0.9, 0.58);
  [0.18, 0.45, 0.72].forEach(y => b.t(CY16, 0x174e94, x, y, z, 0.62, 0.05, 0.62));
  b.t(CY16, 0x2d78d6, x, 0.91, z, 0.5, 0.04, 0.5).cy(0xf3f3f3, 0.09, 0.05, 0.09, x + 0.13, 0.95, z).cy(0x174e94, 0.09, 0.05, 0.09, x - 0.1, 0.95, z + 0.09);
}
function bDrums() { const b = new Builder(); drum(b, -0.33, 0.3); drum(b, 0.33, 0.3); drum(b, 0, -0.3); return b.build(); }
const CARTRIM = new THREE.LatheGeometry([[0.45, -0.04], [0.45, 0.04], [0.39, 0.04], [0.39, -0.04], [0.45, -0.04]].map(p => new THREE.Vector2(p[0], p[1])), 18);
function cartWheel(b, x, y, z) { // wooden spoked wheel with iron rim, axle along x
  b.k(4).t(CARTRIM, 0x2a2a2a, x, y, z, 1, 1, 1, 0, 0, PI2);
  [0, 1, 2].forEach(i => { const a = i * Math.PI / 3, dy = 0.4 * Math.sin(a), dz = 0.4 * Math.cos(a); b.k(3).ln(0x8a5a2e, [x, y - dy, z - dz], [x, y + dy, z + dz], 0.045); });
  b.k(0).t(CY10, 0x4a3320, x, y, z, 0.13, 0.12, 0.13, 0, 0, PI2);
}
function bHandcart(fruit, fs) { // wooden vendor thela loaded with fruit
  const b = new Builder();
  b.k(3).bx(0x8a5a2e, 1.0, 0.08, 1.8, 0, 0.82, -0.5);
  [-1, 1].forEach(s => {
    b.bx(0x7a4a2a, 0.05, 0.28, 1.8, s * 0.5, 0.99, -0.5).bx(0x5a3a22, 0.08, 0.34, 0.12, s * 0.5, 0.62, -0.5);
    b.ln(0x6b4423, [s * 0.38, 0.74, -1.4], [s * 0.38, 0.74, 0.4], 0.1).ln(0x6b4423, [s * 0.38, 0.74, 0.4], [s * 0.38, 0.95, 1.4], 0.09).ln(0x5a3a22, [s * 0.38, 0.9, 1.2], [s * 0.38, 0, 1.25], 0.06);
  });
  b.bx(0x7a4a2a, 1.05, 0.28, 0.05, 0, 0.99, -1.4).bx(0x7a4a2a, 1.05, 0.28, 0.05, 0, 0.99, 0.4).bx(0x6b4423, 0.86, 0.07, 0.07, 0, 0.95, 1.4);
  b.k(4).bx(0x3a3a3a, 1.3, 0.05, 0.05, 0, 0.45, -0.5);
  cartWheel(b, -0.62, 0.45, -0.5); cartWheel(b, 0.62, 0.45, -0.5);
  b.k(0).bx(0x6a3d14, 0.9, 0.16, 1.7, 0, 0.98, -0.5);
  const y0 = 1.06 + fs * 0.42;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) b.ic(pick(fruit), fs, fs * 0.92, fs, -0.3 + i * 0.3, y0, -1.2 + k * 0.3);
  for (let i = 0; i < 2; i++) for (let k = 0; k < 4; k++) b.ic(pick(fruit), fs, fs * 0.92, fs, -0.15 + i * 0.3, y0 + fs * 0.7, -1.05 + k * 0.3);
  return b.build();
}
function bBoulder() { // snow-dusted boulder cluster
  const b = new Builder().k(0);
  b.ic(0x7a746b, 1.9, 1.25, 1.7, 0, 0.55, 0).ic(0x6b655d, 1.0, 0.9, 1.0, 0.55, 0.35, 0.3).ic(0x8a847a, 0.9, 0.7, 0.8, -0.6, 0.3, -0.4).ic(0x5f5a53, 0.7, 0.5, 0.6, 0.3, 0.2, -0.55);
  b.ic(0xf2f6fa, 1.6, 0.55, 1.4, 0, 1.0, 0).ic(0xe8eff5, 0.7, 0.3, 0.6, 0.55, 0.72, 0.3);
  return b.build();
}
function bJersey() { // concrete road barrier with reflector stripes and snow on top
  const b = new Builder().k(2);
  b.bx(0xb4b7bb, 2.0, 0.3, 0.6, 0, 0.15, 0).bx(0xb9bcc0, 2.0, 0.3, 0.46, 0, 0.45, 0).bx(0xbdc0c4, 2.0, 0.3, 0.32, 0, 0.75, 0);
  b.k(0); for (let i = 0; i < 4; i++) b.bx(i % 2 ? 0xf5f3ee : 0xd62828, 0.5, 0.12, 0.02, -0.75 + i * 0.5, 0.45, 0.24);
  b.bx(0xf4f8fb, 2.0, 0.1, 0.34, 0, 0.92, 0);
  return b.build();
}
const OG = {
  barricade: [bBarricade()],
  scooter: [...VG.scooterP, bScooter(0xeeeeea, false), bScooter(0x2a9d8f, false)],
  moto: [...VG.motoP, bMoto(0x1d4e89, false)],
  mirrors: bMirrors(),
  crates: [bCrates([0, 1, 2]), bCrates([2, 0, 1])],
  bricks: [bBricks(), bBricks()],
  piles: [bPile(0xc9b078, [0xb69c62, 0xd8c28a, 0xa88c52]), bPile(0x8d8a84, [0x6f6c66, 0xa09c94, 0x5c5954])],
  dokos: [bDokos(0x4a8c3b, 0xb89968), bDokos(0xd9a21b, 0)],
  chiya: [bChiya()], drums: [bDrums()],
  carts: [bHandcart([0xf08a1c, 0xe87a12, 0xf59a2c], 0.3), bHandcart([0x8fbf5a, 0x7fb04c, 0x9ccc68], 0.34)],
  boulder: [bBoulder()], jersey: [bJersey()]
};
// NOTE: index 0 (cow) and index 5 (scooter) are used by the cow / scooter events in spawnRow
const OT = [
  { n: 'cow', oy1: 1.4, hw: 0.7, hd: 1.1, m: 'MOO-ve it, bhai! 🐄', b: g => { B(0xf4f1ea, 1.1, 0.9, 2, 0, 0.9, 0, g); B(0x222222, 0.5, 0.5, 0.6, 0.3, 1.1, 0.4, g); B(0xf4f1ea, 0.6, 0.6, 0.7, 0, 1.3, -1.2, g); }, u: (o, t) => { o.mesh.position.x = o.x + Math.sin(t * 1.5 + o.z) * 0.7; } },
  { n: 'barricade', oy1: 1.15, hw: 1.0, hd: 0.45, m: 'Road work ahead! 🚧', b: g => addGeo(g, OG.barricade[0]) },
  { n: 'moto', oy1: 1.35, hw: 0.45, hd: 1.25, m: 'Parked bike in the lane! 🏍️', b: g => { const r = pick([0, Math.PI]); addGeo(g, pick(OG.moto), VEHMAT, r); addGeo(g, OG.mirrors, VEHMAT, r); } },
  { n: 'crates', oy1: 1.2, hw: 0.55, hd: 0.7, m: 'Sabji bazaar crates! 🍅', b: g => addGeo(g, pick(OG.crates)) },
  { n: 'bricks', oy1: 0.95, hw: 0.57, hd: 0.35, m: 'Pile of itta bricks! 🧱', b: g => addGeo(g, pick(OG.bricks)) },
  { n: 'scooter', oy1: 1.35, hw: 0.45, hd: 1.15, m: 'Parked scooter! 🛵', b: g => { const r = pick([0, Math.PI]); addGeo(g, pick(OG.scooter), VEHMAT, r); addGeo(g, OG.mirrors, VEHMAT, r); } },
  { n: 'pile', oy1: 1.0, hw: 0.92, hd: 0.92, m: 'Baluwa and gitti pile! ⛰️', b: g => addGeo(g, pick(OG.piles)) },
  { n: 'doko', oy1: 0.8, hw: 0.9, hd: 0.75, m: 'Doko baskets! 🧺', b: g => addGeo(g, pick(OG.dokos)) },
  { n: 'chiya', oy1: 2.25, hw: 0.9, hd: 0.6, m: 'Chiya pasal in the road! ☕', b: g => addGeo(g, OG.chiya[0]) },
  { n: 'drums', oy1: 1.0, hw: 0.65, hd: 0.62, m: 'Blue water drums! 🛢️', b: g => addGeo(g, OG.drums[0]) },
  { n: 'handcart', oy1: 1.55, hw: 0.72, hd: 1.4, m: "Vendor's thela! 🥕", b: g => addGeo(g, pick(OG.carts)) },
  { n: 'micro', oy1: 2.85, hw: 0.95, hd: 2.3, m: 'Microbus, full of passengers! 🚐', b: g => addVeh(g, pick(VG.micro)) },
  { n: 'taxi', oy1: 1.8, hw: 0.8, hd: 1.85, m: 'Taxi! Taxi! 🚕', b: g => addVeh(g, pick(VG.taxi), pick([0, Math.PI])) },
  { n: 'rock', oy1: 1.25, hw: 1.0, hd: 0.9, m: 'Boulder on the road! 🪨', b: g => addGeo(g, OG.boulder[0]) },
  { n: 'jersey', oy1: 0.95, hw: 1.0, hd: 0.32, m: 'Snowy road barrier! ❄️', b: g => addGeo(g, OG.jersey[0]) }
];
const obsIx = n => OT.findIndex(t => t.n === n);
// order matches your zones: Kathmandu, Countryside, Pokhara, Highway, High Himalayas
const OBS_BY_WORLD = [
  ['scooter', 'moto', 'crates', 'barricade', 'bricks', 'chiya', 'drums', 'micro', 'taxi'],
  ['doko', 'handcart', 'pile', 'drums', 'crates'],
  ['scooter', 'moto', 'crates', 'handcart', 'micro'],
  ['barricade', 'moto', 'micro', 'pile'],
  ['jersey', 'rock', 'barricade']
].map(a => a.map(obsIx));
const pools = OT.map(() => []);
const coins = [];

/* ---------- GAME STATE ---------- */
let state = 'menu', last = 0, time = 0, lane = 1, px = 0, py = 0, vy = 0, slideT = 0, ph = 1.8;
let spd = 14, dist = 0, score = 0, coinN = 0, nextZ = -40, evT = 8, boostT = 0, danceT = 0, dieT = 0, reactT = 0, pend = null, hudT = 0, slow = 0, from = 'menu';
const TAGS = ['Bhaag bhaag bhaag! 🏃', 'Chai ke liye ruk nahi sakte!', 'Kathmandu to Himalaya, no brakes!', 'Momo > Everything.'];
const FAILS = ['Cow: 1, You: 0 🐄', 'Bhai, aankhein kholo! 👀', 'Chai spilled. Career over. ☕', 'Auntyji is not impressed. 😤'];
const MSGS = ['Breaking: You are still running! 📰', 'Mummy is calling... ignore! 📞', 'Momo delivery delayed 🥟', 'Plot twist: Traffic jam ahead!'];
$('tag').textContent = pick(TAGS);
$('best').textContent = LS.get('best', 0);

let toastTO;
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastTO); toastTO = setTimeout(() => e.classList.remove('on'), 1900); }

function spawnObs(ti, l, z) {
  const T = OT[ti]; let o = pools[ti].find(x => !x.on);
  if (!o) { const g = new THREE.Group(); T.b(g); S.add(g); o = { mesh: g, T, on: false }; pools[ti].push(o); }
  o.on = true; o.x = LANES[l]; o.z = z; o.oy0 = T.oy0 || 0;
  o.mesh.visible = true; o.mesh.position.set(o.x, 0, z); o.mesh.rotation.set(0, 0, 0); o.mesh.scale.set(1, 1, 1);
  if (Math.random() < 0.1) { toast(T.m); Snd.play('surprise'); }
}
function spawnCoins(l, z, n) {
  for (let i = 0; i < n; i++) {
    let c = coins.find(x => !x.on);
    if (!c) { const g = new THREE.Group(); Sp(0xf8efe0, 0.8, 0.55, 0.8, 0, 0, 0, g); Sp(0xe6d6b8, 0.28, 0.22, 0.28, 0, 0.28, 0, g); S.add(g); c = { mesh: g, on: false }; coins.push(c); }
    c.on = true; c.mesh.visible = true; c.x = LANES[l]; c.z = z - i * 2; c.mesh.position.set(c.x, 1, c.z);
  }
}
function spawnRow(z) {
  const free = rnd(3), ls = [0, 1, 2].filter(l => l !== free);
  if (pend) {
    const ti = pend === 'cow' ? 0 : 5; pend = null;
    (ti === 0 ? ls : [ls[0]]).forEach(l => spawnObs(ti, l, z));
    spawnCoins(free, z, 4); return;
  }
  ls.forEach(l => { if (Math.random(
