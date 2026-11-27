// 30 [FINAL BOSS] 도망쳐라! — 거대 강나나에게서 도망치는 러너 (동우가 카메라 쪽으로 달려온다).
// 탭 = 점프. 장애물은 언제나 바나나 껍질. 걸리면 거인이 가까워지고, 깔끔하게 넘으면 조금 멀어진다.
// 글자 HUD 없음: 거인이 화면에서 커지고, 가까우면 화면 가장자리가 붉게 맥동 + 심장 소리.
// 집이 가까워지면 앞쪽(카메라 쪽)에서 따뜻한 빛이 밝아진다. 끝까지 버티면 집… 소파에 강나나가 이미 앉아 있다.
// 잡히면 거대 강나나 얼굴로 줌인 + 악당 웃음(임시: monkey 저속 재생).
// [PS1] 배경은 지금까지의 스테이지를 짜깁기 (화장실 → 주방 → 섬 → 오락실 → 악몽).
import { fitHeight } from '../core/assets.js';
import { toPS1, ps1Material } from '../../../shared/lib/ps1.js';

const DUR = 24;             // half of the old run to home
const SPEED = 5.5;          // world scroll m/s
const SPAWN_Z = 16;         // obstacles start behind the camera
const HIT_DZ = 0.45;
const HOME = 60;            // interior set offset (x)
const THEMES = [ // toilet → kitchen → island → arcade → nightmare (visual only, no labels)
  { bg: '#203a36', a: '#dfe9e4', b: '#9fbdb2', prop: '#d9a85c' },
  { bg: '#3a2418', a: '#f4efe6', b: '#c83c3c', prop: '#e8e4dc' },
  { bg: '#3aa6d8', a: '#f3d9a0', b: '#e9c985', prop: '#3c9a48' },
  { bg: '#120a2a', a: '#2a1a5a', b: '#ff3ad0', prop: '#40e0ff' },
  { bg: '#1a0606', a: '#2a1a1a', b: '#5a1010', prop: '#2a2a2a' },
];

export default {
  id: 'run', no: 30, cmd: '도망쳐라!', hint: '탭 = 점프', bgm: 'bgm_run', layer: 'both',
  boss: true, duration: DUR, timeout: 'win', afterglow: 3.6,
  sounds: ['evil_laugh', 'stomp', 'jump', 'thud', 'slip', 'scare', 'monkey', 'shared:door_close', 'shared:dread_hit', 'shared:heartbeat_loop', 'shared:breath_close'],

  async load(A) {
    await Promise.all(['gangnana', 'dongwoo_cute', 'peel'].map((n) => A.glb(n)));
  },

  create(G) {
    const { THREE, A, scene, camera } = G;
    const L = G.level;
    const c = G.c2d;
    G.showTimer = false;
    G.usePS1(230);

    camera.fov = 44;
    camera.updateProjectionMatrix();
    const fog = new THREE.Fog('#203a36', 16, 34);
    scene.fog = fog;
    scene.background = new THREE.Color('#203a36');
    const hemi = new THREE.HemisphereLight('#ffffff', '#554444', 2.0);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff2dd', 1.6);
    sun.position.set(3, 8, 6);
    scene.add(sun);
    const homeGlow = new THREE.PointLight('#ffc070', 0, 30, 1.2); // light from home, ahead of the runner (camera side)
    homeGlow.position.set(0, 3, 9);
    scene.add(homeGlow);

    // ------------------------------------------------------------------ ground (scrolling, re-themed)
    const groundTex = THEMES.map((th, i) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const x = cv.getContext('2d');
      x.fillStyle = th.a; x.fillRect(0, 0, 64, 64);
      x.fillStyle = th.b;
      if (i === 2) { for (let k = 0; k < 40; k++) x.fillRect((k * 37) % 64, (k * 23) % 64, 2, 2); }
      else if (i === 3) { x.fillRect(0, 0, 64, 2); x.fillRect(0, 0, 2, 64); x.fillRect(0, 32, 64, 1); x.fillRect(32, 0, 1, 64); }
      else if (i === 4) { for (let k = 0; k < 12; k++) x.fillRect((k * 29) % 64, (k * 41) % 64, 6, 3); }
      else { x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32); }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.repeat.set(3, 30);
      return t;
    });
    const groundMat = ps1Material({ map: groundTex[0] });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 60), groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const sideMat = ps1Material({ color: '#2a2a2a' });
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(30, 60), sideMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(sx * 18, -0.02, 0);
      scene.add(s);
    }

    // side props (recycled, re-themed)
    const propGeo = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8), cone: new THREE.ConeGeometry(0.5, 1, 7) };
    const propMats = THEMES.map((th) => ps1Material({ color: th.prop }));
    const glowMat = ps1Material({ color: '#ff4ad8', emissive: '#c01090' });
    const trunkMat = ps1Material({ color: '#8a5a2a' });
    const props = [];
    const buildProp = (g, ti) => {
      while (g.children.length) g.remove(g.children[0]);
      const add = (geo, m, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); g.add(o); };
      const m = propMats[ti];
      if (ti === 0) { add(propGeo.box, m, 0.08, 2.1, 1.6, 0, 1.05, 0); add(propGeo.box, m, 0.08, 1.8, 1.2, 0.2, 1.0, 0.9); }
      else if (ti === 1) { add(propGeo.box, m, 1.0, 1.0, 1.6, 0, 0.5, 0); add(propGeo.box, propMats[0], 1.0, 1.8, 0.9, 0, 0.9, 1.4); }
      else if (ti === 2) { add(propGeo.cyl, trunkMat, 0.25, 3, 0.25, 0, 1.5, 0); add(propGeo.cone, m, 2.2, 1.0, 2.2, 0, 3.1, 0); }
      else if (ti === 3) { add(propGeo.box, propMats[1], 0.9, 1.9, 0.9, 0, 0.95, 0); add(propGeo.box, glowMat, 0.05, 0.6, 0.7, 0.46 * -Math.sign(g.position.x), 1.35, 0); }
      else { add(propGeo.cyl, m, 0.12, 2.6, 0.12, 0, 1.3, 0); add(propGeo.cyl, m, 0.08, 1.2, 0.08, 0.35, 2.2, 0); g.children[1].rotation.z = -0.8; }
    };
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      g.position.set(i % 2 ? 3.6 : -3.6, 0, SPAWN_Z - Math.floor(i / 2) * 4);
      buildProp(g, 0);
      scene.add(g);
      props.push(g);
    }

    // ------------------------------------------------------------------ actors
    const player = new THREE.Group();
    scene.add(player);
    let pAnim = null;
    A.instance('dongwoo_cute').then(({ root, clips }) => {
      root.traverse((o) => { if (o.isMesh) o.material = toPS1(o.material); });
      fitHeight(root, 1.5);
      player.add(root);
      pAnim = G.animate(root, clips);
      pAnim.play('run', { timeScale: 1.3 });
    });
    const pShadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35 }));
    pShadow.rotation.x = -Math.PI / 2;
    pShadow.position.y = 0.02;
    scene.add(pShadow);

    const giant = new THREE.Group();
    scene.add(giant);
    const giantBody = new THREE.Group();
    giant.add(giantBody);
    let gAnim = null;
    let headBone = null;
    A.instance('gangnana').then(({ root, clips }) => {
      root.traverse((o) => {
        if (!o.isMesh) return;
        const m = toPS1(o.material);
        m.color.multiply(new THREE.Color(1, 0.6, 0.55));
        m.emissive = new THREE.Color('#ff1a00');
        m.emissiveIntensity = 0.35;
        o.material = m;
      });
      fitHeight(root, 5.5);
      giantBody.add(root);
      headBone = root.getObjectByName('headfront'); // sits on the face
      gAnim = G.animate(root, clips);
      gAnim.play('walk', { timeScale: 2.1 });
    });

    // obstacles: always banana peels
    let peelTpl = null;
    A.instance('peel').then(({ root }) => { root.traverse((o) => { if (o.isMesh) o.material = toPS1(o.material); }); fitHeight(root, 0.3); peelTpl = root; });
    const makePeel = () => {
      const t = new THREE.Group();
      if (peelTpl) { const p = peelTpl.clone(); p.scale.multiplyScalar(1.4); t.add(p); }
      t.rotation.y = G.rand(0, 6);
      t.userData.h = 0.42;
      return t;
    };

    // ------------------------------------------------------------------ interior set (ending)
    const home = new THREE.Group();
    home.position.x = HOME;
    scene.add(home);
    let sofaNana = null;
    let homeWho = null;
    {
      const wallM = ps1Material({ color: '#e8d8b8' });
      const floorM = ps1Material({ color: '#9a6a44' });
      const sofaM = ps1Material({ color: '#5a7ac8' });
      const doorM = ps1Material({ color: '#7a4a2a' });
      const f = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), floorM); f.rotation.x = -Math.PI / 2; home.add(f);
      const back = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 0.1), wallM); back.position.set(0, 1.6, -2.5); home.add(back);
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 8), wallM); side.position.set(3, 1.6, 0); home.add(side);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.1, 1.0), doorM); door.position.set(2.94, 1.05, 1.2); home.add(door);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.9), sofaM); seat.position.set(-1.2, 0.25, -1.6); home.add(seat);
      const backr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.25), sofaM); backr.position.set(-1.2, 0.75, -2.05); home.add(backr);
      for (const ax of [-2.25, -0.15]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.9), sofaM); arm.position.set(ax, 0.4, -1.6); home.add(arm); }
      const lampL = new THREE.PointLight('#ffd8a0', 8, 8, 1.5); lampL.position.set(0, 2.6, 0); home.add(lampL);
      A.instance('gangnana').then(({ root, clips }) => {
        root.traverse((o) => { if (o.isMesh) o.material = toPS1(o.material); });
        fitHeight(root, 1.84);
        root.position.set(-1.2, 0.3, -1.55);
        home.add(root);
        sofaNana = { root, anim: G.animate(root, clips), clips };
      });
      A.instance('dongwoo_cute').then(({ root, clips }) => {
        root.traverse((o) => { if (o.isMesh) o.material = toPS1(o.material); });
        fitHeight(root, 1.0);
        root.position.set(2.3, 0, 1.0);
        root.rotation.y = -Math.PI / 2 - 0.6;
        home.add(root);
        homeWho = { root, anim: G.animate(root, clips) };
      });
    }

    // ------------------------------------------------------------------ state
    let dist = 0.7;                                   // 0 = caught
    const decay = [0.008, 0.011, 0.014][L - 1];
    const HIT = 0.22, CLEAR = 0.04;                   // peel hit / clean jump
    const gap = [[1.9, 2.6], [1.5, 2.1], [1.1, 1.7]][L - 1];
    let nextObs = 2.4;
    const obs = [];
    let jumpT = -1;
    let tripT = 0;
    let stompT = 0;
    let theme = 0;
    let endState = null;
    let endT = 0;
    let scroll = 0;
    let homeK = 0;
    const heart = G.sfx('shared:heartbeat_loop', { loop: true, vol: 0 });
    const warm = new THREE.Color('#ffd9a0');

    const setTheme = (i) => {
      theme = i;
      const th = THEMES[i];
      groundMat.map = groundTex[i];
      groundMat.needsUpdate = true;
      sideMat.color.set(th.bg).multiplyScalar(0.7);
    };
    setTheme(0);

    const caught = () => {
      if (endState) return;
      endState = 'lose'; endT = 0;
      G.sfx('stomp', { vol: 1, rate: 0.7 });
      G.sfx('shared:dread_hit', { vol: 0.9 });
      G.shake(20, 0.5);
      heart.stop();
      pAnim?.play('fall', { loop: false });
      gAnim?.play('idle', { fade: 0.4 });
      // evil laugh (placeholder until a real one exists: pitched-down monkey cackle + breath in your ear)
      setTimeout(() => { G.sfx('evil_laugh', { vol: 1, rate: 0.9 }); }, 350);
      setTimeout(() => G.sfx('shared:breath_close', { vol: 0.8, rate: 0.8 }), 1600);
      G.lose();
    };

    const enterHome = () => {
      endState = 'win'; endT = 0;
      G.sfx('shared:door_close', { vol: 1 });
      G.shake(10, 0.2);
      heart.stop();
      if (sofaNana) {
        const a = sofaNana.anim.play('sit', { loop: false, fade: 0 });
        if (a) a.time = a.getClip().duration - 0.02;
      }
      homeWho?.anim.play('idle');
    };

    G.dbg = { obs, get dist() { return dist; }, get jumping() { return jumpT >= 0; } }; // for playtests

    const tryJump = () => {
      if (endState || tripT > 0) return;
      if (jumpT >= 0 && jumpT < 0.55) return;
      jumpT = 0;
      G.sfx('jump', { vol: 0.6 });
    };
    return {
      down() { tryJump(); },
      timeout() { enterHome(); },
      update(dt) {
        const t = G.t;
        const running = !endState;
        const v = running ? SPEED * (1 + t / DUR * 0.25) : 0;

        // background theme changes 5 times over the run (no labels)
        const ti = G.clamp(Math.floor(t / (DUR / 5)), 0, 4); // first frame dt can be negative
        if (ti !== theme && running) setTheme(ti);
        if (running) {
          scroll += v * dt;
          groundTex[theme].offset.y = scroll / 2;
          for (const g of props) {
            g.position.z -= v * dt;
            if (g.position.z < -14) { g.position.z += 28; buildProp(g, theme); }
          }
        }

        // spawn peels (none in the last 3s: home is near)
        if (running && t > nextObs && G.left > 3) {
          const g = makePeel();
          g.position.set(0, 0, SPAWN_Z);
          scene.add(g);
          obs.push({ g, h: g.userData.h, hit: false, cleared: false });
          nextObs = t + G.rand(...gap);
        }

        // player
        if (tripT > 0) {
          tripT -= dt;
          if (tripT <= 0 && !endState) pAnim?.play('run', { timeScale: 1.3 });
        }
        let py = 0;
        if (jumpT >= 0) {
          jumpT += dt;
          const k = jumpT / 0.7;
          if (k >= 1) jumpT = -1; else py = 4 * 1.35 * k * (1 - k);
        }
        player.position.y = py;
        player.rotation.x = jumpT >= 0 ? 0.3 : 0;
        pShadow.scale.setScalar(1 - py * 0.3);

        // peels
        for (let i = obs.length - 1; i >= 0; i--) {
          const o = obs[i];
          if (o.hit) { o.g.position.y += o.vy * dt; o.vy -= 18 * dt; o.g.rotation.x += dt * 9; o.g.position.z -= dt * 3; }
          if (running) o.g.position.z -= v * dt;
          const z = o.g.position.z;
          if (!o.hit && running && Math.abs(z) < HIT_DZ && py < o.h * 0.85) {
            o.hit = true;
            o.vy = 5;
            tripT = 0.85;
            jumpT = -1;
            dist -= HIT;
            pAnim?.play('fall', { loop: false, timeScale: 1.6 });
            G.sfx('slip', { vol: 0.9 });
            G.sfx('thud', { vol: 0.6 });
            G.shake(12, 0.3);
          }
          if (!o.hit && !o.cleared && running && z < -HIT_DZ) { o.cleared = true; dist = Math.min(1, dist + CLEAR); }
          if (z < -14 || o.g.position.y < -3) { scene.remove(o.g); obs.splice(i, 1); }
        }

        // distance + giant
        if (running) {
          dist -= decay * dt;
          if (dist <= 0) { dist = 0; caught(); }
          heart.setVol(G.clamp((0.55 - dist) * 2.2, 0, 1));
          heart.setRate(1 + G.clamp(0.5 - dist, 0, 0.5));
          // home is near: warm light from ahead, the scene brightens
          homeK = G.clamp(1 - G.left / 5, 0, 1);
          homeGlow.intensity = homeK * 60;
          hemi.intensity = 2 + homeK * 1.5;
          fog.color.set(THEMES[theme].bg).lerp(warm, homeK * 0.8);
          scene.background.copy(fog.color);
        }
        const gzTarget = -(2.0 + dist * 9);
        if (!endState) giant.position.z += (gzTarget - giant.position.z) * Math.min(1, dt * 3);
        if (gAnim && running) {
          stompT -= dt;
          if (stompT <= 0) {
            stompT = 0.48;
            const close = 1 - dist;
            G.sfx('stomp', { vol: 0.25 + close * 0.5, rate: G.rand(0.8, 1) });
            if (close > 0.55) G.shake(2 + close * 7, 0.12);
          }
        }

        // camera
        if (endState === 'win') {
          endT += dt;
          camera.position.set(HOME + 1.6, 1.5, 3.4);
          const k = G.clamp((endT - 1.5) / 0.6, 0, 1);
          const look = new THREE.Vector3(HOME + G.lerp(2.3, -1.2, k * k * (3 - 2 * k)), G.lerp(0.8, 1.0, k), G.lerp(1.0, -1.5, k));
          camera.lookAt(look);
        } else if (endState === 'lose') {
          endT += dt;
          giant.position.z += (-1.4 - giant.position.z) * Math.min(1, dt * 4);
          giantBody.rotation.x = Math.min(0.3, endT * 0.5);          // leans over you
          // zoom into the giant's face
          const k = G.clamp((endT - 0.25) / 1.3, 0, 1), e = k * k * (3 - 2 * k);
          giant.updateMatrixWorld(true);
          const face = headBone ? headBone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)) : new THREE.Vector3(0, 4.55, 0.2).applyMatrix4(giantBody.matrixWorld);
          const jit = Math.sin(endT * 40) * 0.03 * e;
          camera.position.set(jit, G.lerp(5.8, face.y + 0.1, e), G.lerp(13.5, face.z + 3.1, e));
          camera.lookAt(0, G.lerp(1.4, face.y + 0.3, e), G.lerp(-3, face.z, e));
          camera.fov = G.lerp(44, 40, e);
          camera.updateProjectionMatrix();
        } else {
          const sway = Math.sin(t * 9) * 0.04;
          camera.position.set(sway, 5.8, 13.5);
          camera.lookAt(0, 1.4, -3);
        }

        this.hud();
      },

      hud() {
        const t = G.t;
        if (!endState) {
          // no text HUD: red screen-edge pulse when the giant is close
          const close = G.clamp((0.5 - dist) / 0.5, 0, 1);
          if (close > 0) {
            const a = close * (0.45 + 0.35 * Math.sin(t * (6 + close * 8)));
            const g = c.createRadialGradient(300, 400, 220, 300, 400, 560);
            g.addColorStop(0, 'rgba(255,0,0,0)');
            g.addColorStop(1, `rgba(255,0,0,${a})`);
            c.fillStyle = g;
            c.fillRect(0, 0, 600, 800);
          }
          if (homeK > 0) { // warm light pouring in from ahead (bottom of the screen)
            const g = c.createRadialGradient(300, 900, 50, 300, 900, 720);
            g.addColorStop(0, `rgba(255,236,190,${homeK * 0.85})`);
            g.addColorStop(1, 'rgba(255,200,120,0)');
            c.fillStyle = g;
            c.fillRect(0, 0, 600, 800);
          }
        }
        if (endState === 'win') {
          if (endT < 0.4) { c.fillStyle = `rgba(0,0,0,${1 - endT / 0.4})`; c.fillRect(0, 0, 600, 800); }
          if (endT < 0.35) G.text('쾅!', 300, 400, { size: 120, color: '#fff' });
          // speech bubbles in the scene (core suppresses captions once the round is decided)
          if (endT > 0.4 && endT < 1.5 && homeWho) {
            const s = G.toScreen(homeWho.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.0, 0)));
            G.bubble('휴… 살았다', G.clamp(s.x + 60, 120, 480), G.clamp(s.y - 120, 90, 500), { size: 32, tail: [s.x, s.y - 20] });
          }
          if (endT > 2.1 && sofaNana) {
            if (!this._said) { this._said = true; G.sfx('scare', { vol: 0.5 }); }
            const s = G.toScreen(sofaNana.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.5, 0)));
            G.bubble('…같이 놀자.', G.clamp(s.x + 40, 130, 470), G.clamp(s.y - 130, 90, 500), { size: 38, tail: [s.x + 10, s.y - 10] });
          }
        }
        if (endState === 'lose') {
          const g = c.createRadialGradient(300, 380, 120, 300, 380, 520);
          g.addColorStop(0, 'rgba(120,0,0,0)');
          g.addColorStop(1, `rgba(60,0,0,${Math.min(0.85, endT * 0.6)})`);
          c.fillStyle = g;
          c.fillRect(0, 0, 600, 800);
        }
      },
      dispose() { heart.stop(); },
    };
  },
};
