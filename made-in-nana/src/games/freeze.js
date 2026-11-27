// 25 멈춰라! — 무궁화 꽃이 피었습니다. 홀드하면 걷고, 다크나나가 돌아보면 손을 뗀다. 걸리면 점프스케어 → "놀랐지?" (PS1 어둠)
import { toPS1, ps1Material } from '../../../shared/lib/ps1.js';
import { fitHeight } from '../core/assets.js';

let FACE = null; // darknana.jpg (model sheet; we crop the big face)
const CHANT = '무궁화꽃이피었습니다';

export default {
  id: 'freeze', no: 25, cmd: '멈춰라!', hint: '꾹 = 걷기 · 돌아보면 떼기', bgm: 'bgm_spooky', layer: 'both',
  duration: 6, timeout: 'lose', sounds: ['scare', 'whoosh', 'bonk', 'shared:jumpscare_sting', 'shared:footstep_tile_1', 'shared:footstep_tile_2', 'shared:dread_hit'],

  async load(A) {
    await A.glb('darknana');
    FACE = await A.img('darknana.jpg').catch(() => null);
    await A.texture('../shared/assets/tex/concrete.jpg').catch(() => null);
    await A.texture('../shared/assets/tex/tile.jpg').catch(() => null);
  },

  create(G) {
    const { THREE, scene, camera, A } = G;
    G.usePS1(200);
    scene.background = new THREE.Color('#050406');
    scene.fog = new THREE.Fog('#050406', 3, 15);
    scene.add(new THREE.HemisphereLight('#4a4660', '#100808', 0.7));

    // corridor
    const D = [5, 6, 6.5][G.level - 1]; // distance to Darknana
    const len = D + 6;
    const corridor = new THREE.Group();
    scene.add(corridor);
    const mat = (tex, color, rx, ry) => {
      const m = ps1Material({ color });
      A.texture(tex).then((t) => {
        const c = t.clone();
        c.wrapS = c.wrapT = THREE.RepeatWrapping;
        c.repeat.set(rx, ry);
        c.needsUpdate = true;
        m.map = c;
        m.needsUpdate = true;
      }).catch(() => {});
      return m;
    };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, len), mat('../shared/assets/tex/tile.jpg', '#8a8a90', 3, len));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -len / 2 + 2;
    const ceil = floor.clone();
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 2.8;
    ceil.material = ps1Material({ color: '#1a181c' });
    corridor.add(floor, ceil);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.8), mat('../shared/assets/tex/concrete.jpg', '#6a6670', len / 2, 1.4));
      w.rotation.y = -s * Math.PI / 2;
      w.position.set(1.5 * s, 1.4, -len / 2 + 2);
      corridor.add(w);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.8), ps1Material({ color: '#201c22' }));
    back.position.set(0, 1.4, -D - 2);
    corridor.add(back);
    // a flickering lamp over Darknana + a dim one mid-way
    const spot = new THREE.PointLight('#d8d0ff', 6, 6, 1.4);
    spot.position.set(0, 2.6, -D + 0.4);
    scene.add(spot);
    const mid = new THREE.PointLight('#ffb070', 1.5, 5, 1.6);
    mid.position.set(0, 2.5, -D / 2);
    scene.add(mid);

    // Darknana, back turned
    const dn = new THREE.Group();
    dn.position.set(0, 0, -D);
    dn.rotation.y = Math.PI;
    scene.add(dn);
    let anim = null, front = null;
    const eyes = new THREE.Group();
    eyes.visible = false;
    scene.add(eyes);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff2a2a', fog: false }));
      e.position.x = s * 0.055;
      eyes.add(e);
    }
    A.instance('darknana').then(({ root, clips }) => {
      fitHeight(root, 1.75);
      root.traverse((o) => {
        if (o.isMesh) o.material = toPS1(o.material);
        if (o.name === 'headfront') front = o;
      });
      dn.add(root);
      anim = G.animate(root, clips);
      anim.play('idle');
    });

    // camera = player
    const EYE = 1.58;
    let z = 1.2, walkT = 0, stepN = 0;
    camera.position.set(0, EYE, z);
    camera.lookAt(0, 1.45, -D);

    // light schedule: green (singing) -> turning -> watching -> turning back
    const sp = G.speed;
    let watchLen = 1, phase = 'green', phT = 0, greenLen = G.rand(0.9, 1.4) / sp, turnK = 0, fake = false, sung = 0;
    let holding = false, state = 'play', stT = 0;
    G.dbg = { phase, z, D };
    const WALK = 2.3 * sp;
    const GRACE = 0.2 / sp;

    const nextGreen = () => {
      phase = 'green'; phT = 0; sung = 0;
      greenLen = G.rand(0.8, 1.4) / sp;
      fake = G.level >= 3 && Math.random() < 0.45;
    };

    const caught = () => {
      state = 'scare'; stT = 0;
      holding = false;
      G.sfx('scare');
      G.sfx('shared:jumpscare_sting', { vol: 0.9 });
      G.shake(26, 0.45);
      // she is suddenly right in your face
      dn.position.set(0, 0, z - 0.75);
      dn.rotation.y = 0;
      anim?.play('hit', { fade: 0.05 });
      G.lose();
    };
    const reached = () => {
      state = 'tag'; stT = 0;
      holding = false;
      G.sfx('bonk');
      anim?.play('hit', { loop: false });
      G.win();
    };

    return {
      down() { if (state === 'play') holding = true; },
      up() { holding = false; },
      timeout() { if (state === 'play') caught(); }, // she gets you anyway
      update(dt) {
        stT += dt;
        phT += dt;
        // schedule
        if (state === 'play') {
          if (phase === 'green') {
            sung = Math.min(1, phT / greenLen);
            if (phT >= greenLen) { phase = 'turn'; phT = 0; G.sfx('whoosh', { vol: 0.5, rate: 0.6 }); }
          } else if (phase === 'turn') {
            const tt = 0.22 / sp;
            turnK = Math.min(1, phT / tt) * (fake ? 0.35 : 1);
            if (phT >= tt) {
              if (fake) { phase = 'back'; phT = 0; }
              else { phase = 'watch'; phT = 0; watchLen = G.rand(0.7, 0.95) / sp; G.sfx('shared:dread_hit', { vol: 0.5 }); }
            }
          } else if (phase === 'watch') {
            if (holding && phT > GRACE) caught();
            else if (phT >= watchLen) { phase = 'back'; phT = 0; }
          } else if (phase === 'back') {
            const tt = 0.18 / sp;
            turnK = Math.max(0, (fake ? 0.35 : 1) * (1 - phT / tt));
            if (phT >= tt + (fake ? 0.05 : 0)) nextGreen();
          }
        }
        if (state === 'play') {
          dn.rotation.y = Math.PI * (1 - turnK);
          // walk
          if (holding) {
            z -= WALK * dt;
            walkT += dt * 9 * sp;
            if (Math.floor(walkT / Math.PI) > stepN) { stepN = Math.floor(walkT / Math.PI); G.sfx(`shared:footstep_tile_${(stepN % 2) + 1}`, { vol: 0.5 }); }
          }
          if (z <= -D + 1.15) reached();
        }
        G.dbg.phase = phase; G.dbg.z = z; G.dbg.holding = holding;
        spot.intensity = 6 * (Math.random() < 0.04 ? 0.3 : 1);
        camera.position.set(Math.sin(walkT * 0.5) * 0.03, EYE + Math.abs(Math.sin(walkT)) * 0.04, z);
        if (state === 'tag') {
          // she spins around, startled
          dn.rotation.y = Math.PI * Math.max(0, 1 - stT / 0.2);
          eyes.visible = false;
          spot.intensity = 9;
          camera.position.set(0, EYE, -D + 1.9);
          camera.lookAt(0, 0.8 - Math.min(1, stT / 0.6) * 0.5, -D - 0.2);
        } else if (state === 'scare') camera.lookAt(0, 1.5, z - 1);
        else camera.lookAt(0, 1.45, Math.min(z - 2, -D));
        if (front && eyes.visible) {
          front.getWorldPosition(eyes.position);
          eyes.quaternion.copy(dn.quaternion);
          eyes.translateZ(0.03);
          eyes.translateY(0.02);
        }

        // 2D
        const c = G.c2d;
        if (state === 'play') {
          const n = phase === 'green' ? Math.floor(sung * CHANT.length) : CHANT.length;
          const shown = CHANT.slice(0, n);
          if (phase === 'green' || phase === 'back') G.text(shown, 300, 110, { size: 40, color: '#e8e0ff', alpha: 0.85 });
          if (phase === 'watch' || (phase === 'turn' && !fake)) {
            G.text('멈춰!', 300, 120, { size: 76, color: '#ffffff' });
            c.save();
            const g = c.createRadialGradient(300, 400, 200, 300, 400, 520);
            g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
            c.fillStyle = g; c.fillRect(0, 0, 600, 800);
            c.restore();
          }
          if (!holding && phase === 'green' && G.t < 1.5) G.text('꾹!', 300, 600, { size: 60, color: '#fff', alpha: 0.5 + 0.5 * Math.sin(G.t * 9) });
        }
        if (state === 'scare') {
          if (FACE) {
            // full-screen face flash
            const w = FACE.naturalWidth, h = FACE.naturalHeight;
            const z2 = 1 + stT * 0.6;
            c.save();
            c.fillStyle = '#000'; c.fillRect(0, 0, 600, 800);
            c.translate(300 + (Math.random() - 0.5) * 30, 400 + (Math.random() - 0.5) * 30);
            c.scale(z2, z2);
            c.filter = 'contrast(1.6) saturate(0.3) brightness(0.9)';
            c.drawImage(FACE, w * 0.23, h * 0.0, w * 0.14, h * 0.15, -380, -360, 760, 700);
            c.filter = 'none';
            c.globalCompositeOperation = 'multiply';
            c.fillStyle = Math.random() < 0.5 ? '#9a9a9a' : '#ffffff';
            c.fillRect(-400, -400, 800, 800);
            c.restore();
          }
        }
      },
    };
  },
};
