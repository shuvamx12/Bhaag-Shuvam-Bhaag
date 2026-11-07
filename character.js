// @ts-nocheck
'use strict';
/* =====================================================================
   character.js  -  use YOUR OWN 3D character (.glb) as the runner.
   Loaded AFTER script.js (see index.html). Does not change gameplay:
   the hitbox, lanes, jump and slide stay exactly the same; only the
   look of the player changes. If no model is found, the original
   blocky runner is used.

   Two ways to give it your model:
   1) Put a file named  character.glb  in the same folder as index.html
   2) In the main menu tap "3D CHARACTER" and pick a .glb from your phone
      (it is remembered on that device).
   ===================================================================== */
(function () {
  const safe = (name, fn) => { try { fn(); } catch (e) { console.warn('character:' + name, e); } };

  /* ---- Settings you can change ---- */
  const CHAR = {
    path: 'character.glb', // file next to index.html
    height: 2.1,           // character height in game units (the old runner is about 2.1)
    faceBack: true         // true = model's front faces +Z (normal for GLB), so we turn it to run away from the camera
  };

  /* ---- Tiny IndexedDB store so a picked file survives reloads ---- */
  const DB = 'runnerbabu', STORE = 'files', KEY = 'character';
  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const idbGet = () => idb().then(db => new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }));
  const idbSet = buf => idb().then(db => new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(buf, KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }));
  const idbDel = () => idb().then(db => new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }));

  /* ---- Model state ---- */
  let pivot = null, mixer = null, roles = {}, current = null, resetBtn = null;

  /* ---- Code-driven run pose for models with NO animation clips (fixes the T-pose) ---- */
  const BN = { spine: /^Spine1_/, lArm: /^LeftArm_/, rArm: /^RightArm_/, lFore: /^LeftForeArm_/, rFore: /^RightForeArm_/, lUp: /^LeftUpLeg_/, rUp: /^RightUpLeg_/, lLeg: /^LeftLeg_/, rLeg: /^RightLeg_/ };
  let bones = null, model3 = null, phase = 0, cur = null;
  const _dq = new THREE.Quaternion(), _eu = new THREE.Euler(), _qa = new THREE.Quaternion(), _P = new THREE.Quaternion();
  function findBones(model) {
    const b = {};
    model.traverse(o => { if (o.isBone) for (const k in BN) if (!b[k] && BN[k].test(o.name)) b[k] = o; });
    if (!(b.lArm && b.rArm && b.lUp && b.rUp)) return null; // not a Mixamo-style skeleton: skip posing
    const rest = {}; for (const k in b) rest[k] = b[k].quaternion.clone();
    return { b, rest };
  }
  function R(x, y, z) { return _dq.setFromEuler(_eu.set(x, y, z, 'XYZ')); }
  function qModel(node) { _P.identity(); for (let n = node; n && n !== model3; n = n.parent) _P.premultiply(n.quaternion); return _P; }
  function pose(k, dq) { // rotate bone by dq (model-space axes) on top of its parent's current pose
    const bn = bones.b[k]; if (!bn) return;
    qModel(bn.parent); _qa.copy(_P).invert();
    bn.quaternion.copy(_qa).multiply(dq).multiply(_P).multiply(bones.rest[k]);
  }
  const IDLE = { lean: 0, down: 1.4, swL: 0, swR: 0, foreL: 0.15, foreR: 0.15, legL: 0, legR: 0, kneeL: 0, kneeR: 0 };
  function poseTick(dt) {
    if (!bones) return;
    if (state === 'play') phase += dt * spd * 0.55;
    const s = Math.sin(phase), c = Math.cos(phase);
    let t;
    if (state === 'dying') t = { lean: -0.2, down: 0.6, swL: -0.4, swR: -0.4, foreL: 0.2, foreR: 0.2, legL: -0.3, legR: 0.3, kneeL: 0.3, kneeR: 0.3 };
    else if (state === 'play' && py > 0.05) t = { lean: 0.1, down: 1.0, swL: -0.7, swR: -0.7, foreL: 0.8, foreR: 0.8, legL: -0.9, legR: 0.3, kneeL: 0.9, kneeR: 0.5 };
    else if (state === 'play' && slideT > 0) t = { lean: 0, down: 1.2, swL: 0.6, swR: 0.6, foreL: 0.3, foreR: 0.3, legL: -1.2, legR: -1.2, kneeL: 0.1, kneeR: 0.1 };
    else if (state === 'play') t = { lean: 0.2, down: 1.4, swL: 0.7 * s, swR: -0.7 * s, foreL: 1.1, foreR: 1.1, legL: -0.9 * s, legR: 0.9 * s, kneeL: 0.2 + Math.max(0, c), kneeR: 0.2 + Math.max(0, -c) };
    else t = IDLE;
    const a = Math.min(1, dt * 14);
    for (const k in t) cur[k] += (t[k] - cur[k]) * a;
    pose('spine', R(cur.lean, 0, 0));
    pose('lArm', R(cur.swL, 0, -cur.down)); pose('rArm', R(cur.swR, 0, cur.down));
    pose('lFore', R(-cur.foreL, 0, 0)); pose('rFore', R(-cur.foreR, 0, 0));
    pose('lUp', R(cur.legL, 0, 0)); pose('rUp', R(cur.legR, 0, 0));
    pose('lLeg', R(cur.kneeL, 0, 0)); pose('rLeg', R(cur.kneeR, 0, 0));
  }

  function clear() {
    if (pivot) {
      rig.remove(pivot);
      pivot.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        ms.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); });
      });
      if (mixer) mixer.stopAllAction();
    }
    pivot = null; mixer = null; roles = {}; current = null; bones = null; model3 = null; cur = null;
    rig.children.forEach(c => { c.visible = true; }); // bring back the blocky runner
    if (resetBtn) resetBtn.style.display = 'none';
  }

  function install(gltf) {
    clear();
    const model = gltf.scene;
    model.traverse(o => { if (o.isMesh) { o.castShadow = SHADOWS; o.frustumCulled = false; } });
    const box = new THREE.Box3().setFromObject(model), size = new THREE.Vector3(), ctr = new THREE.Vector3();
    box.getSize(size); box.getCenter(ctr);
    if (!(size.y > 0) || !isFinite(size.y)) throw new Error('The model looks empty');
    model.position.set(-ctr.x, -box.min.y, -ctr.z);           // feet on the ground, centred
    pivot = new THREE.Group(); pivot.add(model);
    pivot.scale.setScalar((CHAR.height / 0.8) / size.y);       // rig is scaled 0.8 in the game
    pivot.rotation.y = CHAR.faceBack ? Math.PI : 0;
    rig.children.forEach(c => { c.visible = false; });         // hide the blocky runner (kept in memory)
    rig.add(pivot);

    const clips = gltf.animations || [];
    if (clips.length) {
      mixer = new THREE.AnimationMixer(model);
      const acts = clips.map(c => ({ n: c.name || '', a: mixer.clipAction(c) }));
      const find = re => { const f = acts.find(x => re.test(x.n)); return f ? f.a : null; };
      roles.run = find(/run|jog|sprint/i) || find(/walk/i) || acts[0].a;
      roles.idle = find(/idle|stand|breath/i);
      roles.jump = find(/jump|leap/i);
      roles.slide = find(/slide|roll|crouch|duck/i);
      roles.die = find(/die|death|fall|hit|dead/i);
      [roles.jump, roles.slide, roles.die].forEach(a => { if (a && a !== roles.run) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } });
    }
    if (!clips.length) { model3 = model; bones = findBones(model); if (bones) cur = Object.assign({}, IDLE); }
    if (resetBtn) resetBtn.style.display = '';
  }

  function play(role) {
    let a = roles[role] || (role === 'idle' || role === 'jump' || role === 'slide' || role === 'die' ? roles.run : null);
    if (!a || a === current) return;
    a.reset().fadeIn(0.15).play();
    if (current) current.fadeOut(0.15);
    current = a;
  }

  function tick(dt) {
    if (!pivot) return;
    if (!mixer) { // model has no animations: simple bob while running
      pivot.position.y = (state === 'play' && py < 0.05) ? Math.abs(Math.sin(time * spd * 0.5)) * 0.08 : 0;
      poseTick(dt);
      return;
    }
    let role;
    if (state === 'dying') role = 'die';
    else if (state === 'play') role = py > 0.05 ? 'jump' : (slideT > 0 ? 'slide' : 'run');
    else role = 'idle';
    play(role);
    if (roles.run) roles.run.timeScale = state === 'play' ? Math.max(0.6, Math.min(1.8, spd / 14)) : 0.6;
    mixer.update(dt);
  }

  /* ---- Loading ---- */
  function fail(e) { console.warn('character: could not load model', e); if (typeof toast === 'function') toast('Could not load that 3D file'); }
  function loadBuffer(buf) {
    if (!THREE.GLTFLoader) { fail('GLTFLoader missing (check internet)'); return; }
    try { new THREE.GLTFLoader().parse(buf, '', g => { try { install(g); if (typeof toast === 'function') toast('3D character loaded! 🏃'); } catch (e) { fail(e); } }, fail); } catch (e) { fail(e); }
  }
  function loadPath() {
    if (!THREE.GLTFLoader || LS.get('charOff', false)) return;
    new THREE.GLTFLoader().load(CHAR.path, g => { try { install(g); } catch (e) { fail(e); } }, undefined, () => { /* no file there: keep the blocky runner */ });
  }

  /* ---- Menu buttons (no HTML change needed) ---- */
  safe('ui', () => {
    const menu = $('menu'), inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.glb,.gltf,model/gltf-binary'; inp.style.display = 'none';
    const mk = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.style.minHeight = '44px'; b.style.fontSize = '.85rem'; b.onclick = fn; menu.appendChild(b); return b; };
    mk('3D CHARACTER', () => inp.click());
    resetBtn = mk('BLOCKY CHARACTER', () => { LS.set('charOff', true); idbDel().catch(() => {}); clear(); toast('Back to the blocky runner'); });
    resetBtn.style.display = 'none';
    menu.appendChild(inp);
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      f.arrayBuffer().then(buf => {
        LS.set('charOff', false); loadBuffer(buf);
        idbSet(buf).catch(() => toast('Loaded, but could not save it for next time'));
      }).catch(fail);
      inp.value = '';
    };
  });

  /* ---- Per-frame hook (same pattern as the other add-ons) ---- */
  safe('hook', () => {
    let lt = performance.now();
    const _render = R.render.bind(R);
    R.render = function (sc, cm) {
      const now = performance.now(), dt = Math.min(0.05, (now - lt) / 1000); lt = now;
      if (state !== 'pause') safe('tick', () => tick(dt));
      return _render(sc, cm);
    };
  });

  /* ---- Start: a picked file wins, otherwise character.glb next to index.html ---- */
  safe('start', () => {
    idbGet().then(buf => { if (buf && !LS.get('charOff', false)) loadBuffer(buf); else loadPath(); }).catch(loadPath);
  });
})();
