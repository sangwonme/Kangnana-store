// 02 한번에 찾아라! — 한 번에 맞혀야 한다 (첫 오답 = 즉시 실패). 바나나 더미 속에 파묻힌 진짜 강나나를 찾아 탭한다. 가짜: 매직으로 얼굴 그린 바나나, 동우. L3는 더미가 섞인다. (큐트3D)
import { fitHeight } from '../core/assets.js';

// marker-pen face doodle on a transparent canvas (the decoys). peach = painted skin oval, harder to tell apart
function doodle(THREE, peach) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.lineCap = x.lineJoin = 'round';
  if (peach) {
    x.fillStyle = '#f3c39a';
    x.beginPath(); x.ellipse(64, 66, 40, 48, 0, 0, Math.PI * 2); x.fill();
  }
  x.strokeStyle = x.fillStyle = '#1b1306';
  x.lineWidth = 7;
  const v = Math.floor(Math.random() * 3);
  for (const ex of [46, 82]) {
    x.beginPath();
    if (v === 0) x.arc(ex, 56, 6, 0, Math.PI * 2), x.fill();
    else if (v === 1) x.arc(ex, 60, 9, Math.PI * 1.1, Math.PI * 1.9), x.stroke();
    else x.moveTo(ex - 7, 50), x.lineTo(ex + 7, 62), x.moveTo(ex + 7, 50), x.lineTo(ex - 7, 62), x.stroke();
  }
  x.beginPath();
  x.arc(64, 74, 17, 0.15 * Math.PI, 0.85 * Math.PI);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default {
  id: 'find', no: 2, cmd: '한번에 찾아라!', hint: '진짜 강나나를 탭 (기회 1번)', bgm: 'bgm_silly', layer: 'both',
  duration: 5, timeout: 'lose', sounds: ['pop', 'boing', 'sparkle', 'whoosh'],

  async load(A) {
    await Promise.all(['gangnana_cute', 'dongwoo_cute', 'banana'].map((n) => A.glb(n)));
  },

  create(G) {
    const { THREE, A, scene, camera } = G;
    scene.background = new THREE.Color('#8fd8ff');
    scene.fog = new THREE.Fog('#8fd8ff', 14, 30);
    scene.add(new THREE.HemisphereLight('#ffffff', '#e8c890', 2.2));
    const sun = new THREE.DirectionalLight('#fff4d8', 2);
    sun.position.set(3, 8, 5);
    scene.add(sun);
    camera.position.set(0, 6.4, 5.2);
    camera.lookAt(0, 0.2, -0.5);

    const sand = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshLambertMaterial({ color: '#f3d9a0' }));
    sand.rotation.x = -Math.PI / 2;
    scene.add(sand);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 20), new THREE.MeshLambertMaterial({ color: '#2fb6d8' }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.01, -15);
    scene.add(sea);
    const mat = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), new THREE.MeshLambertMaterial({ color: '#ff8fa3' }));
    mat.rotation.x = -Math.PI / 2;
    mat.scale.y = 0.85;
    mat.position.set(0, 0.02, -0.4);
    scene.add(mat);

    const L = G.level;
    const nBanana = [15, 21, 24][L - 1];
    const nDoodle = [2, 3, 4][L - 1];
    const RX = 2.3, RZ = 1.9, CZ = -0.4;
    const heap = (x, z) => 0.15 + 0.75 * Math.max(0, 1 - (x * x) / (RX * RX) - ((z - CZ) ** 2) / (RZ * RZ));

    const items = []; // top-level pile things: {g, kind, base: Vector3, hop}
    const tmp = new THREE.Vector3();
    let ready = false;
    let nana = null; // {holder, body, anchor, anim, coverers}
    let picked = null; // wrong item
    let shuffleT = 0.9;

    // positions: rejection sampling so things don't fully overlap
    const spots = [];
    // special spots (faces) keep a wider clearing so plain bananas never bury them
    const spot = (scale, minD, special = false) => {
      for (let k = 0; k < 160; k++) {
        const a = G.rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * scale;
        const x = Math.cos(a) * RX * r, z = CZ + Math.sin(a) * RZ * r;
        const ok = spots.every((s) => Math.hypot(s.x - x, s.z - z) > (s.special || special ? Math.max(minD, 0.85) : minD)
          // a plain banana may not lie in front of (camera side) or on top of a face
          && (special || !s.special || Math.abs(s.x - x) > 0.8 || z - s.z < -1.0 || z - s.z > 1.05));
        if (ok) {
          const v = new THREE.Vector3(x, heap(x, z), z);
          v.special = special;
          spots.push(v);
          return v;
        }
      }
      const v = new THREE.Vector3(G.rand(-RX, RX) * 0.8, 0, CZ + G.rand(-RZ, RZ) * 0.8);
      v.y = heap(v.x, v.z);
      return v;
    };

    const build = async () => {
      // banana template centred on its own origin so it rotates in place
      const broot = (await A.instance('banana')).root;
      fitHeight(broot, 0.95);
      broot.position.y -= 0.475;
      const tmpl = new THREE.Group();
      tmpl.add(broot);
      const banana = () => {
        const b = tmpl.clone();
        b.rotation.set(G.rand(-0.3, 0.3), G.rand(0, Math.PI * 2), Math.PI / 2 + G.rand(-0.35, 0.35), 'ZXY');
        b.scale.setScalar(G.rand(0.9, 1.1));
        return b;
      };
      const person = async (kind, at) => {
        const { root, clips } = await A.instance(kind);
        fitHeight(root, 1.0);
        const holder = new THREE.Group();
        const body = new THREE.Group();
        body.rotation.x = -1.1; // lying back, head propped up toward the camera
        body.add(root);
        holder.add(body);
        holder.position.copy(at).setY(at.y + 0.05);
        holder.rotation.y = G.rand(-0.6, 0.6) + (Math.random() < 0.5 ? 0 : Math.PI * 0.12);
        const anchor = new THREE.Object3D();
        anchor.position.set(0, 0.74, 0.2);
        body.add(anchor);
        const anim = G.animate(root, clips);
        anim.play('idle', { timeScale: 0.7 });
        // bananas lying across the belly and legs
        const coverers = [];
        for (const [x, z, ry] of [[0.08, 0.2, 1.5], [-0.1, -0.02, 1.7]]) {
          const b = banana();
          const wrap = new THREE.Group();
          wrap.position.set(x, 0.03, z);
          wrap.rotation.y = ry;
          wrap.add(b);
          b.rotation.y = Math.PI / 2 + G.rand(-0.2, 0.2); // curve lying flat so it never hides the face
          wrap.userData.item = { kind: 'banana', g: wrap, base: wrap.position.clone(), hop: -1, child: true };
          holder.add(wrap);
          coverers.push(wrap);
        }
        scene.add(holder);
        return { holder, body, anchor, anim, coverers };
      };

      const nAt = spot(L === 1 ? 0.4 : 0.65, 0.9, true); // L1: near the middle, easy to spot
      nana = await person('gangnana_cute', nAt);
      const reg = (g, kind) => { const it = { g, kind, base: g.position.clone(), hop: -1 }; g.userData.item = it; items.push(it); return it; };
      reg(nana.holder, 'nana');
      for (const c of nana.coverers) c.userData.item.parent = nana.holder;
      if (L >= 2) {
        const d = await person('dongwoo_cute', spot(0.8, 1.0, true));
        reg(d.holder, 'dongwoo');
        d.anim.play('idle', { timeScale: 1.2 });
      }
      for (let i = 0; i < nDoodle; i++) {
        const at = spot(0.9, 0.75, true);
        const g = new THREE.Group();
        g.position.copy(at).setY(at.y + 0.12);
        g.rotation.y = G.rand(-0.5, 0.5);
        const b = tmpl.clone();
        b.rotation.set(0, Math.PI / 2, Math.PI / 2, 'ZXY'); // curve lying flat
        g.add(b);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42),
          new THREE.MeshBasicMaterial({ map: doodle(THREE, L >= 2 && i % 3 !== 2), transparent: true, depthWrite: false }));
        face.position.set(G.rand(-0.12, 0.12), 0.27, 0.04);
        face.rotation.x = -1.15;
        g.add(face);
        scene.add(g);
        reg(g, 'doodle');
      }
      for (let i = 0; i < nBanana; i++) {
        const at = spot(1, 0.5);
        const b = banana();
        b.position.copy(at);
        scene.add(b);
        reg(b, 'banana');
      }
      // a few loose ones around the edge so the heap does not look cut out
      for (let i = 0; i < 4; i++) {
        const a = G.rand(0, Math.PI * 2);
        const b = banana();
        b.position.set(Math.cos(a) * RX * 1.15, 0.15, CZ + Math.sin(a) * RZ * 1.15);
        scene.add(b);
      }
      ready = true;
    };
    build();

    const itemOf = (o) => { for (; o; o = o.parent) if (o.userData.item) return o.userData.item; return null; };
    const hop = (it) => { it.hop = 0; };
    const nanaScreen = () => G.toScreen(nana.anchor.getWorldPosition(tmp));

    const popNana = () => { nana.pop = 0; nana.anim.play('cheer'); };

    // L3: swap random pairs with a little hop (always involving the real one)
    const swaps = [];
    const shuffle = () => {
      const pool = items.filter((it) => it.kind !== 'nana');
      const pairs = [[items.find((it) => it.kind === 'nana'), G.pick(pool)]];
      for (let k = 0; k < 3; k++) pairs.push([G.pick(pool), G.pick(pool)]);
      for (const [a, b] of pairs) {
        if (a === b || a.swapping || b.swapping) continue;
        const pa = a.base.clone(), pb = b.base.clone();
        a.swapping = b.swapping = true;
        swaps.push({ it: a, from: pa, to: pb, t: 0 }, { it: b, from: pb, to: pa, t: 0 });
        a.base.copy(pb); b.base.copy(pa);
      }
      G.sfx('whoosh', { vol: 0.35, rate: 1.4 });
    };

    return {
      down(p) {
        if (!ready) return;
        const s = nanaScreen();
        if (Math.hypot(s.x - p.x, s.y - p.y) < 72) {
          popNana();
          G.sfx('sparkle');
          G.sfx('pop');
          G.win();
          return;
        }
        const hits = G.ray(p).intersectObjects(scene.children, true);
        for (const h of hits) {
          const it = itemOf(h.object);
          if (!it) continue;
          if (it.kind === 'nana') { // tapped his body, close enough
            popNana(); G.sfx('sparkle'); G.win(); return;
          }
          picked = it;
          hop(it);
          G.sfx('boing');
          G.lose();
          return;
        }
      },
      timeout() { if (nana) popNana(); },
      dispose() { scene.traverse((o) => o.material?.map?.isCanvasTexture && o.material.map.dispose()); },
      update(dt) {
        if (!ready) return;
        // L3 shuffle
        if (L >= 3 && !G.result) {
          shuffleT -= dt * G.speed;
          if (shuffleT <= 0) { shuffleT = 1.0; shuffle(); }
        }
        for (let i = swaps.length - 1; i >= 0; i--) {
          const s = swaps[i];
          s.t = Math.min(1, s.t + dt * G.speed / 0.38);
          const e = s.t * s.t * (3 - 2 * s.t);
          s.it.g.position.lerpVectors(s.from, s.to, e);
          s.it.g.position.y += Math.sin(Math.PI * s.t) * 0.9;
          if (s.t >= 1) { s.it.swapping = false; swaps.splice(i, 1); }
        }
        // wrong pick: it jumps up and turns to the camera
        if (picked) {
          picked.hop += dt;
          const k = Math.min(1, picked.hop / 0.25);
          const g = picked.g;
          if (picked.child) g.position.y = picked.base.y + k * 1.2;
          else g.position.y = picked.base.y + k * 1.3 + Math.sin(G.t * 12) * 0.05 * k;
          g.rotation.x += (-0.2 - g.rotation.x) * k * 0.2;
        }
        if (nana.pop != null) {
          // he stands up out of the pile and faces the camera
          nana.pop += dt;
          const k = Math.min(1, nana.pop / 0.3);
          const h = nana.holder;
          nana.holderY ??= h.position.y;
          h.position.y = nana.holderY + k * (0.45 + Math.abs(Math.sin(nana.pop * 7)) * 0.3);
          nana.body.rotation.x = G.lerp(-1.1, -0.75, k);
          h.rotation.y *= 1 - k * 0.3;
          nana.coverers.forEach((c, i) => {
            c.position.x += (i ? -1 : 1) * dt * 3;
            c.position.y += (2 - nana.pop * 8) * dt;
            c.rotation.z += dt * 9;
          });
        }
        // the wrong object asks who you are
        if (picked && picked.hop > 0.15) {
          const s = G.toScreen(picked.g.getWorldPosition(tmp));
          G.bubble(picked.kind === 'dongwoo' ? '…동우인데요' : '누구세요?', G.clamp(s.x - 30, 110, 490), s.y - 90, { size: 32, tail: [s.x, s.y - 15] });
          if (picked.hop > 0.5 && nana.pop == null) popNana();
        }
      },
    };
  },
};
