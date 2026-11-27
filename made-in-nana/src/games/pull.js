// 13 뽑아라! — 모래에 꼭지만 내민 강나나를 위로 여러 번 스와이프해서 뽑는다. 뽑으면 무처럼 비정상적으로 길다. (큐트3D)
import { fitHeight } from '../core/assets.js';

const H = 1.5; // Gangnana height

export default {
  id: 'pull', no: 13, cmd: '뽑아라!', hint: '위로 스와이프 연타', bgm: 'bgm_island', layer: 'both',
  duration: 5, afterglow: 1.7, timeout: 'lose', sounds: ['sand', 'pop', 'sparkle', 'boing'],

  async load(A) {
    await Promise.all(['gangnana_cute', 'btree'].map((n) => A.glb(n)));
  },

  create(G) {
    const { THREE, A, scene, camera } = G;
    scene.background = new THREE.Color('#8fd8ff');
    scene.fog = new THREE.Fog('#8fd8ff', 12, 28);
    scene.add(new THREE.HemisphereLight('#ffffff', '#e8c890', 2.2));
    const sun = new THREE.DirectionalLight('#fff4d8', 2);
    sun.position.set(3, 8, 5);
    scene.add(sun);
    const camBase = new THREE.Vector3(0, 1.45, 3.7);
    camera.position.copy(camBase);
    camera.lookAt(0, 0.6, 0);

    const sandMat = new THREE.MeshLambertMaterial({ color: '#f3d9a0' });
    const sand = new THREE.Mesh(new THREE.CircleGeometry(30, 32), sandMat);
    sand.rotation.x = -Math.PI / 2;
    scene.add(sand);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 20), new THREE.MeshLambertMaterial({ color: '#2fb6d8' }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.01, -16);
    scene.add(sea);
    // little sand mound around the hole
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#e9c987' }));
    mound.scale.y = 0.18;
    scene.add(mound);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshBasicMaterial({ color: '#7a5a2c' }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.1;
    hole.visible = false;
    scene.add(hole);

    A.instance('btree').then(({ root }) => {
      fitHeight(root, 4.2);
      root.position.set(-2.6, 0, -2.5);
      scene.add(root);
    });

    // buried Gangnana: holder.y = how far his feet are below the sand
    const holder = new THREE.Group();
    scene.add(holder);
    let anim = null;
    let ready = false;
    A.instance('gangnana_cute').then(({ root, clips }) => {
      fitHeight(root, H);
      holder.add(root);
      anim = G.animate(root, clips);
      anim.play('idle');
      ready = true;
    });

    // radish root hairs, drawn as thin lines under his feet (shown when he comes out)
    const rootPts = [];
    for (let i = 0; i < 34; i++) {
      const x = G.rand(-0.25, 0.25), z = G.rand(-0.12, 0.12);
      let px = x, py = 0.05, pz = z;
      const len = G.rand(0.25, 0.7);
      for (let s = 0; s < 3; s++) {
        const nx = px + G.rand(-0.12, 0.12), ny = py - len / 3, nz = pz + G.rand(-0.08, 0.08);
        rootPts.push(px, py, pz, nx, ny, nz);
        px = nx; py = ny; pz = nz;
      }
    }
    const rootGeo = new THREE.BufferGeometry();
    rootGeo.setAttribute('position', new THREE.Float32BufferAttribute(rootPts, 3));
    const roots = new THREE.LineSegments(rootGeo, new THREE.LineBasicMaterial({ color: '#8a6232' }));
    roots.visible = false;
    scene.add(roots);

    // sand grains
    const grains = [];
    const grainGeo = new THREE.IcosahedronGeometry(0.04, 0);
    const burst = (n, y = 0.1) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(grainGeo, sandMat);
        m.position.set(G.rand(-0.2, 0.2), y, G.rand(-0.1, 0.2));
        scene.add(m);
        grains.push({ m, v: new THREE.Vector3(G.rand(-1.5, 1.5), G.rand(1.5, 3.2), G.rand(-0.5, 1.2)) });
      }
    };

    const need = [5, 7, 8][G.level - 1];
    const START = 0.17; // only the stem tip shows
    const END = 0.85;   // head + shoulders out
    let prog = 0;       // 0..1 (pulls / need), can sink back at L3
    let tug = 0;        // springy stretch after each pull
    let acc = 0;
    let lastY = null;
    let sinceTug = 9;
    let state = 'stuck';
    let tt = 0;
    let stem = null;

    const reveal = () => START + (END - START) * prog;

    const pull = () => {
      if (!ready || state !== 'stuck') return;
      prog = Math.min(1, prog + 1 / need);
      tug = 1;
      sinceTug = 0;
      burst(4);
      G.sfx('sand', { vol: 0.7, rate: 0.9 + prog * 0.5 });
      if (prog >= 1) {
        state = 'out';
        tt = 0;
        anim.play('cheer');
        hole.visible = true;
        burst(14);
        G.sfx('pop');
        G.sfx('sparkle', { vol: 0.7 });
        G.shake(10, 0.3);
        G.win();
      }
    };

    const fail = () => {
      state = 'stemless';
      tt = 0;
      const top = holder.position.y + H;
      stem = new THREE.Group();
      const sMat = new THREE.MeshLambertMaterial({ color: '#5b3a1a' });
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 8), sMat);
      c.position.y = 0.08;
      stem.add(c);
      stem.position.set(0, Math.max(0.12, top - 0.1), 0.02);
      stem.userData.v = new THREE.Vector3(0.6, 3.2, 0.4);
      scene.add(stem);
      hole.visible = true;
      burst(6);
      G.sfx('pop');
    };

    return {
      down(p) { lastY = p.y; acc = 0; },
      move(p) {
        if (!p.down || lastY == null) return;
        const dy = lastY - p.y;
        lastY = p.y;
        acc = dy > 0 ? acc + dy : Math.max(0, acc + dy * 2);
        if (acc > 65) { acc = 0; pull(); }
      },
      up() { lastY = null; },
      timeout(r) { if (r === 'lose') fail(); },
      update(dt) {
        tt += dt;
        sinceTug += dt;
        tug = Math.max(0, tug - dt * 5);
        if (state === 'stuck') {
          if (G.level >= 3 && sinceTug > 0.45 && prog > 0) {
            const before = prog;
            prog = Math.max(0, prog - dt * 0.35 * G.speed);
            if (Math.floor(before * 20) !== Math.floor(prog * 20)) G.sfx('sand', { vol: 0.25, rate: 0.6 });
          }
          holder.position.y = reveal() - H + Math.sin(tug * Math.PI) * 0.1;
          holder.scale.set(1 - tug * 0.08, 1 + tug * 0.12, 1 - tug * 0.08);
          holder.rotation.z = Math.sin(G.t * 23) * 0.03 * prog;
        } else if (state === 'out') {
          // shoots out absurdly long; camera backs off
          const e = 1 - (1 - Math.min(1, tt / 0.7)) ** 3;
          const y0 = END - H;
          holder.position.y = G.lerp(y0, 0.25, e);
          holder.scale.set(1, 1 + 5.5 * e, 1);
          holder.rotation.z = Math.sin(tt * 9) * 0.04;
          roots.visible = holder.position.y > -0.1;
          roots.position.y = holder.position.y;
          roots.rotation.y = tt * 0.6;
          // then zoom all the way out so the whole ridiculous length is on screen
          const top = holder.position.y + H * holder.scale.y;
          const z = Math.min(1, Math.max(0, (tt - 0.3) / 0.6));
          const zz = z * z * (3 - 2 * z);
          const midY = G.lerp(0.6 + e * 1.7, top / 2 + 0.2, zz);
          camera.position.set(0, G.lerp(camBase.y + e * 0.9, midY, zz), G.lerp(camBase.z + e * 3.2, (top / 2 + 0.8) / Math.tan(0.436) + 0.5, zz));
          camera.lookAt(0, midY, 0);
        } else if (state === 'stemless') {
          // the stem pops off, he sinks back under
          holder.position.y = Math.max(-H - 0.1, holder.position.y - dt * 3);
          const v = stem.userData.v;
          if (stem.position.y > 0.05 || v.y > 0) {
            v.y -= 9 * dt;
            stem.position.addScaledVector(v, dt);
            stem.rotation.z -= dt * 14;
          } else if (!stem.userData.landed) {
            stem.userData.landed = true;
            stem.position.y = 0.05;
            stem.rotation.z = Math.PI / 2;
            G.sfx('boing', { vol: 0.5, rate: 1.6 });
          }
          if (tt > 0.35) {
            // speech bubble from under the sand
            const s = G.toScreen(new THREE.Vector3(0, 0.15, 0));
          }
        }
        for (let i = grains.length - 1; i >= 0; i--) {
          const g = grains[i];
          g.v.y -= 9 * dt;
          g.m.position.addScaledVector(g.v, dt);
          if (g.m.position.y < 0) { scene.remove(g.m); grains.splice(i, 1); }
        }
        // hint arrows until the first few pulls
        if (state === 'stuck' && ready && prog < 0.3 && G.t > 0.3) {
          const s = G.toScreen(new THREE.Vector3(0, reveal() + 0.25, 0));
          for (let k = 0; k < 3; k++) {
            const ph = (G.t * 2.2 + k / 3) % 1;
            G.text('▲', s.x, s.y - ph * 160, { size: 46, color: '#ffd400', alpha: Math.sin(ph * Math.PI) });
          }
        }
        if (state === 'out' && tt > 0.9) {
          // measuring tape next to him
          const a = G.toScreen(new THREE.Vector3(0.6, holder.position.y, 0));
          const b = G.toScreen(new THREE.Vector3(0.6, holder.position.y + H * holder.scale.y, 0));
          const c = G.c2d, al = Math.min(1, (tt - 0.9) * 4);
          c.save();
          c.globalAlpha = al;
          c.strokeStyle = '#ff5a5f'; c.lineWidth = 5;
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
          c.moveTo(a.x - 14, a.y); c.lineTo(a.x + 14, a.y); c.moveTo(b.x - 14, b.y); c.lineTo(b.x + 14, b.y);
          c.stroke();
          c.restore();
          G.text('100m', a.x + 70, (a.y + b.y) / 2, { size: 48, color: '#fff', alpha: al });
        }
      },
    };
  },
};
