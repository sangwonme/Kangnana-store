// 05 부풀려라! — 바람 빠진 비닐 강나나 인형에 펌프 연타. 시간이 끝나는 순간 게이지가 초록 구간 안이면 성공, 넘치면 펑.
// [비닐] gangnana.glb + 노멀 방향 부풀리기 셰이더(스키닝 뒤에 주입) + 반짝이는 비닐 재질.
import { fitHeight } from '../core/assets.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BANDS = [[0.55, 0.86], [0.62, 0.8], [0.58, 0.82]];
const STEP = 0.07; // gauge per pump
let envTex = null; // PMREM of a RoomEnvironment, built once per renderer

export default {
  id: 'inflate', no: 5, cmd: '부풀려라!', hint: '연타 → 초록에서 멈춰', bgm: 'bgm_silly', layer: 'both',
  duration: 5, timeout: 'lose', sounds: ['pump', 'pop', 'deflate', 'squeak', 'sputter', 'boing', 'sparkle', 'fart_2'],

  async load(A) { await A.glb('gangnana'); },

  create(G) {
    const { THREE, A, scene, camera } = G;
    const [lo, hi] = BANDS[G.level - 1];
    const leak = G.level >= 3 ? 0.075 * G.speed : 0;

    if (!envTex) {
      const pm = new THREE.PMREMGenerator(G.renderer);
      envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    scene.environment = envTex;
    scene.background = new THREE.Color('#ffd9e6');
    scene.add(new THREE.HemisphereLight('#ffffff', '#ffb0c8', 1.2));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(2, 4, 5);
    scene.add(key);
    camera.position.set(0, 1.25, 5.4);
    camera.lookAt(0, 1.0, 0);

    // room: polka-dot wall + floor
    const dots = document.createElement('canvas');
    dots.width = dots.height = 128;
    const dc = dots.getContext('2d');
    dc.fillStyle = '#ffd9e6'; dc.fillRect(0, 0, 128, 128);
    dc.fillStyle = '#ffc2d6';
    for (const [x, y] of [[32, 32], [96, 96], [96, 32], [32, 96]]) { dc.beginPath(); dc.arc(x, y, x === y ? 14 : 8, 0, 7); dc.fill(); }
    const dt = new THREE.CanvasTexture(dots);
    dt.wrapS = dt.wrapT = THREE.RepeatWrapping;
    dt.repeat.set(8, 6);
    dt.colorSpace = THREE.SRGBColorSpace;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshLambertMaterial({ map: dt }));
    wall.position.set(0, 4, -2.5);
    scene.add(wall);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshLambertMaterial({ color: '#c9a3ff' }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    scene.add(shadow);

    // pump (primitives)
    const red = new THREE.MeshStandardMaterial({ color: '#e8322f', roughness: 0.35 });
    const metal = new THREE.MeshStandardMaterial({ color: '#cfd6dc', roughness: 0.25, metalness: 0.8 });
    const black = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.6 });
    const pump = new THREE.Group();
    pump.position.set(-1.0, 0, 1.3);
    scene.add(pump);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.24), black);
    foot.position.y = 0.03;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.85, 16), red);
    barrel.position.y = 0.48;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16), black);
    cap.position.y = 0.92;
    pump.add(foot, barrel, cap);
    const handle = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), metal);
    rod.position.y = 0.3;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10), black);
    grip.rotation.z = Math.PI / 2;
    grip.position.y = 0.6;
    handle.add(rod, grip);
    handle.position.y = 0.95;
    pump.add(handle);
    const hoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.88, 0.12, 1.3), new THREE.Vector3(-0.7, 0.03, 1.1), new THREE.Vector3(-0.4, 0.03, 0.6), new THREE.Vector3(-0.12, 0.08, 0.2)]);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 24, 0.028, 6), black));

    // the vinyl doll
    const doll = new THREE.Group();
    scene.add(doll);
    const U = { uInflate: { value: 0 }, uWrinkle: { value: 0 } };
    let skinned = null;
    let dollReady = false;
    A.instance('gangnana').then(({ root }) => {
      fitHeight(root, 1.84);
      root.traverse((o) => {
        if (!o.isMesh) return;
        skinned = o;
        // skinned vertices live in the mesh's (attached-bind) local space: world height / mesh world scale
        root.updateMatrixWorld(true);
        const hLocal = 1.84 / o.getWorldScale(new THREE.Vector3()).y;
        const src = o.material;
        const m = new THREE.MeshPhysicalMaterial({ map: src.map, color: '#ffffff', roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3 });
        m.onBeforeCompile = (s) => {
          s.uniforms.uInflate = U.uInflate;
          s.uniforms.uWrinkle = U.uWrinkle;
          s.vertexShader = s.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uInflate; uniform float uWrinkle;')
            .replace('#include <skinning_vertex>', `#include <skinning_vertex>
              {
                vec3 n = normalize(objectNormal);
                float wr = sin(transformed.y * ${(40 / hLocal).toFixed(4)} + transformed.x * ${(23 / hLocal).toFixed(4)})
                         * sin(transformed.z * ${(31 / hLocal).toFixed(4)} - transformed.y * ${(17 / hLocal).toFixed(4)});
                transformed += n * (uInflate + uWrinkle * wr) * ${hLocal.toFixed(5)};
              }`);
        };
        m.customProgramCacheKey = () => 'vinyl-inflate';
        o.material = m;
      });
      doll.add(root);
      dollReady = true;
    });

    // air leak puffs (L3)
    const puffs = [];
    const puffMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 });
    const puffGeo = new THREE.SphereGeometry(0.05, 8, 6);

    let g = 0;            // gauge 0..1 (1 = pop)
    let shown = 0;        // smoothed for drawing
    let pumpT = 1;        // handle stroke anim
    let taps = 0;
    let state = 'play';   // play | float | pop | flop
    let endT = 0;
    let vel = new THREE.Vector3();
    let puffClock = 0;

    const pop = () => {
      state = 'pop';
      endT = 0;
      G.sfx('pop', { vol: 1 });
      G.sfx('deflate', { vol: 0.9 });
      G.shake(16, 0.35);
      vel.set(G.rand(-1, 1) > 0 ? 5 : -5, 6, 1);
      G.lose();
    };
    const judge = () => {
      if (G.result) return;
      if (g >= lo && g <= hi) {
        state = 'float'; endT = 0;
        G.sfx('sparkle'); G.sfx('boing', { vol: 0.6 });
        G.win();
      } else if (g > hi) pop();
      else {
        state = 'flop'; endT = 0;
        G.sfx('fart_2', { vol: 0.8 });
        G.lose();
      }
    };

    const gauge = () => {
      const c = G.c2d;
      const x = 520, top = 150, bot = 640, w = 46;
      const yOf = (v) => bot - v * (bot - top);
      c.save();
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.strokeStyle = '#1b1306';
      c.lineWidth = 6;
      c.beginPath(); c.roundRect(x - w / 2, top - 10, w, bot - top + 20, 23); c.fill();
      c.save();
      c.beginPath(); c.roundRect(x - w / 2 + 3, top - 7, w - 6, bot - top + 14, 20); c.clip();
      // band
      c.fillStyle = '#3ddc84';
      c.fillRect(x - w / 2 + 5, yOf(hi), w - 10, yOf(lo) - yOf(hi));
      // danger zone
      c.fillStyle = '#ff5a5f';
      c.fillRect(x - w / 2, top - 10, w, yOf(0.93) - top + 10);
      // fill
      c.globalAlpha = 0.75;
      c.fillStyle = shown > hi ? '#ff8a3d' : '#58b7ff';
      c.fillRect(x - w / 2 + 10, yOf(shown), w - 20, bot + 10 - yOf(shown));
      c.globalAlpha = 1;
      c.restore();
      c.beginPath(); c.roundRect(x - w / 2, top - 10, w, bot - top + 20, 23); c.stroke();
      // pointer
      const py = yOf(shown);
      c.fillStyle = '#1b1306';
      c.beginPath(); c.moveTo(x - w / 2 - 6, py); c.lineTo(x - w / 2 - 26, py - 12); c.lineTo(x - w / 2 - 26, py + 12); c.fill();
      c.restore();
      G.text('여기!', x, (yOf(lo) + yOf(hi)) / 2, { size: 22, color: '#fff' });
      G.text('펑', x, top + 10, { size: 22, color: '#fff' });
    };

    return {
      down() {
        if (state !== 'play') return;
        taps++;
        pumpT = 0;
        g += STEP;
        G.sfx('pump', { vol: 0.8, rate: 0.9 + g * 0.5 });
        if (g > 0.85) G.sfx('squeak', { vol: 0.5, rate: 0.8 + g * 0.6 });
        if (g >= 1) pop();
      },
      timeout(r) {
        // core decided before us (frame hitch): still show the matching gag
        if (state !== 'play') return;
        endT = 0;
        if (r === 'lose') { if (g > hi) { state = 'pop'; G.sfx('pop'); G.sfx('deflate'); vel.set(5, 6, 1); } else { state = 'flop'; G.sfx('fart_2'); } }
      },
      update(dt) {
        // decide at the buzzer (timeout result depends on the gauge)
        if (state === 'play' && !G.result && G.left <= 0.05) judge();
        if (state === 'play' && leak && g > 0) {
          g = Math.max(0, g - leak * dt);
          puffClock -= dt;
          if (puffClock <= 0 && dollReady) {
            puffClock = 0.08;
            const p = new THREE.Mesh(puffGeo, puffMat);
            p.position.set(0.35 * (0.4 + g), 0.75, 0.25 * (0.4 + g));
            p.userData.v = new THREE.Vector3(G.rand(0.6, 1.2), G.rand(-0.2, 0.3), G.rand(0.2, 0.6));
            p.userData.life = 0.5;
            scene.add(p);
            puffs.push(p);
          }
        }
        for (let i = puffs.length - 1; i >= 0; i--) {
          const p = puffs[i];
          p.position.addScaledVector(p.userData.v, dt);
          p.userData.life -= dt;
          p.scale.setScalar(1 + (0.5 - p.userData.life) * 3);
          if (p.userData.life <= 0) { scene.remove(p); puffs.splice(i, 1); }
        }

        shown += (Math.min(1, g) - shown) * Math.min(1, dt * 14);
        pumpT = Math.min(1, pumpT + dt * 7);
        handle.position.y = 0.95 - Math.sin(pumpT * Math.PI) * 0.4;

        // doll shape from gauge: deflated puddle -> plump -> bursting
        const s = state === 'play' || state === 'float' ? shown : null;
        if (s !== null) {
          U.uInflate.value = -0.004 + s * 0.05 + Math.max(0, s - 0.8) * 0.13;
          U.uWrinkle.value = Math.max(0, 0.6 - s) * 0.015;
          const sy = G.lerp(0.32, 1, Math.min(1, s * 1.35));
          const sxz = G.lerp(1.35, 1, Math.min(1, s * 1.35)) + Math.max(0, s - 0.75) * 0.5;
          const shake = s > 0.88 && state === 'play' ? Math.sin(G.t * 70) * 0.03 * (s - 0.85) * 10 : 0;
          doll.scale.set(sxz + shake, sy, sxz);
          doll.rotation.z = (1 - Math.min(1, s * 1.4)) * 0.35 * Math.sin(G.t * 2.4) + shake;
          doll.rotation.x = (1 - Math.min(1, s * 1.4)) * 0.5;
        }
        shadow.scale.setScalar(Math.max(0.2, doll.scale.x * (1 - doll.position.y * 0.25)));

        if (state === 'float') {
          endT += dt;
          doll.position.y += dt * (1 + endT * 3);
          doll.position.x += Math.sin(endT * 5) * dt * 0.8;
          doll.rotation.z = Math.sin(endT * 4) * 0.2;
        } else if (state === 'pop') {
          endT += dt;
          U.uInflate.value = Math.max(-0.008, U.uInflate.value - dt * 0.06);
          U.uWrinkle.value = Math.min(0.012, U.uWrinkle.value + dt * 0.02);
          vel.y += Math.sin(endT * 9) * 30 * dt - 4 * dt;
          vel.x += Math.cos(endT * 7) * 40 * dt;
          doll.position.addScaledVector(vel, dt);
          if (doll.position.x < -1.8 || doll.position.x > 1.8) { vel.x *= -1; doll.position.x = G.clamp(doll.position.x, -1.8, 1.8); }
          if (doll.position.y < 0 || doll.position.y > 2.4) { vel.y *= -0.9; doll.position.y = G.clamp(doll.position.y, 0, 2.4); }
          doll.rotation.x += dt * 9;
          doll.rotation.z += dt * 13;
          const k = Math.max(0.35, 1 - endT * 0.6);
          doll.scale.set(k, k, k);
        } else if (state === 'flop') {
          endT += dt;
          doll.rotation.x = G.lerp(doll.rotation.x, -Math.PI / 2 + 0.05, Math.min(1, dt * 8));
          doll.scale.y = G.lerp(doll.scale.y, 0.25, Math.min(1, dt * 6));
          U.uWrinkle.value = 0.012;
        }

        // 2D overlay
        gauge();
        if (state === 'play' && taps < 3) {
          const pulse = 1 + Math.sin(G.t * 14) * 0.08;
          G.text('연타!', 150, 470, { size: 54 * pulse, color: '#ffd400' });
        }
        if (state === 'play' && shown > hi) G.text('그만!!', 300, 140, { size: 64, color: '#ff5a5f', alpha: 0.6 + 0.4 * Math.sin(G.t * 20) });
        if (leak && state === 'play') G.text('피식…', 420, 420, { size: 26, color: '#fff', alpha: 0.5 + 0.5 * Math.sin(G.t * 9) });
        void skinned;
      },
      dispose() { scene.environment = null; puffGeo.dispose(); puffMat.dispose(); },
    };
  },
};
