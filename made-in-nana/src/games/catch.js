// 14 받아라! — 바나나 나무에서 떨어지는 강나나를 바구니로 받는다. 놓치면 머리부터 모래에 꽂힌다.
// L3에는 불붙은 폭탄이 섞여 떨어진다: 받으면 펑, 피하면 모래에서 피식 꺼진다.
import { fitHeight } from '../core/assets.js';

export default {
  id: 'catch', no: 14, cmd: '받아라!', hint: (lv) => (lv >= 3 ? '드래그 ↔ · 💣는 피해라' : '드래그 ↔'), bgm: 'bgm_island', layer: '3d',
  duration: 5, timeout: 'lose', sounds: ['thud', 'sand', 'burnt', 'sparkle', 'pop'],

  async load(A) {
    await Promise.all(['gangnana_cute', 'basket', 'btree'].map((n) => A.glb(n)));
  },

  create(G) {
    const { THREE, A, scene, camera } = G;
    scene.background = new THREE.Color('#8fd8ff');
    scene.fog = new THREE.Fog('#8fd8ff', 14, 30);
    scene.add(new THREE.HemisphereLight('#ffffff', '#e8c890', 2.2));
    const sun = new THREE.DirectionalLight('#fff4d8', 2);
    sun.position.set(3, 8, 5);
    scene.add(sun);
    camera.position.set(0, 3.2, 9);
    camera.lookAt(0, 2.6, 0);

    const sand = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshLambertMaterial({ color: '#f3d9a0' }));
    sand.rotation.x = -Math.PI / 2;
    scene.add(sand);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 20), new THREE.MeshLambertMaterial({ color: '#2fb6d8' }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.01, -16);
    scene.add(sea);

    const ready = (async () => {
      for (const [x, s] of [[-3.4, 1], [3.5, -1]]) {
        const t = (await A.instance('btree')).root;
        fitHeight(t, 5.5);
        t.position.set(x, 0, -3);
        t.scale.x *= s;
        scene.add(t);
      }
    })();

    // basket (player)
    const basket = new THREE.Group();
    scene.add(basket);
    A.instance('basket').then(({ root }) => {
      fitHeight(root, 0.7);
      root.scale.x *= 1.6;
      root.scale.z *= 1.3;
      basket.add(root);
    });
    let targetX = 0;

    // fallers
    const n = G.level >= 2 ? 2 : 1;
    const fallers = [];
    const spawn = async (kind, delay, x) => {
      const { root, clips } = await A.instance(kind);
      fitHeight(root, 1.3);
      const holder = new THREE.Group();
      holder.add(root);
      holder.position.set(x, 8 + delay * 4, 0);
      scene.add(holder);
      const anim = G.animate(root, clips);
      anim.play(kind === 'darknana' ? 'idle' : 'fall');
      fallers.push({ kind, holder, anim, vy: 0, delay, state: 'fall', spin: G.rand(-3, 3) });
    };
    const xs = [G.rand(-2.2, 2.2)];
    xs.push(xs[0] > 0 ? G.rand(-2.2, -0.4) : G.rand(0.4, 2.2));
    for (let i = 0; i < n; i++) spawn('gangnana_cute', i * 0.55, xs[i]);

    // cartoon bomb: glossy black ball, metal cap, curved fuse, flickering spark + red blink
    const makeBomb = (x, delay) => {
      const holder = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16),
        new THREE.MeshStandardMaterial({ color: '#15151a', roughness: 0.25, metalness: 0.3, emissive: '#ff0000', emissiveIntensity: 0 }));
      ball.position.y = 0.45;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 12), new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.8, roughness: 0.3 }));
      cap.position.y = 0.88;
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.92, 0), new THREE.Vector3(0.05, 1.2, 0), new THREE.Vector3(0.28, 1.25, 0));
      const fuse = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.035, 6), new THREE.MeshLambertMaterial({ color: '#c8a060' }));
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffdd33' }));
      spark.position.set(0.28, 1.25, 0);
      const glow = new THREE.PointLight('#ff9a1a', 4, 3);
      glow.position.copy(spark.position);
      holder.add(ball, cap, fuse, spark, glow);
      holder.position.set(x, 8 + delay * 4, 0);
      scene.add(holder);
      fallers.push({ kind: 'bomb', holder, ball, spark, vy: 0, delay, state: 'fall', spin: G.rand(-2, 2), anim: { play() {} } });
    };
    // lands on the side of the first catch, after it, so the player has to move away
    if (G.level >= 3) makeBomb(G.clamp(xs[0] + G.rand(-0.3, 0.3), -2.4, 2.4), 0.3);
    const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0 }));
    scene.add(boom);
    let boomT = -1;
    let stack = 0;

    const pointerX = (p) => {
      const v = G.groundPoint(p, 0.4);
      return v ? G.clamp(v.x, -2.6, 2.6) : targetX;
    };

    return {
      down(p) { targetX = pointerX(p); },
      move(p) { if (p.down) targetX = pointerX(p); },
      update(dt) {
        basket.position.x += (targetX - basket.position.x) * Math.min(1, dt * 18);
        const g = 9 * G.speed * (0.8 + 0.15 * G.level);
        for (const f of fallers) {
          const h = f.holder;
          if (f.state === 'fall') {
            if (f.delay > 0) { f.delay -= dt; continue; }
            f.vy -= g * dt * 0.55;
            h.position.y += f.vy * dt;
            h.rotation.z += f.spin * dt;
            if (h.position.y < 0.75 && h.position.y > 0.1 && Math.abs(h.position.x - basket.position.x) < 0.95) {
              if (f.kind === 'bomb') {
                f.state = 'gone';
                h.visible = false;
                boom.position.set(h.position.x, 0.9, 0.5);
                boomT = 0;
                G.sfx('burnt');
                G.caption('폭탄은 받는 게 아니야…');
                G.shake(22, 0.5);
                for (const o of fallers) if (o.state === 'caught') { o.state = 'blown'; o.vx = G.rand(-4, 4); o.vy = G.rand(6, 9); o.anim.play('fall'); }
                basket.traverse((o) => { if (o.isMesh) o.material.color?.multiplyScalar(0.25); });
                G.lose();
              } else {
                f.state = 'caught';
                f.offset = (Math.random() - 0.5) * 0.4;
                f.stack = stack++;
                h.rotation.set(0, 0, Math.PI / 2 * (stack % 2 ? 1 : -1) * 0.9);
                f.anim.play('cheer');
                G.sfx('thud');
                G.sfx('sparkle', { vol: 0.6 });
                if (fallers.filter((o) => o.kind !== 'bomb').every((o) => o.state === 'caught')) G.win();
              }
            } else if (h.position.y <= 0.1) {
              if (f.kind === 'bomb') { f.state = 'dud'; h.position.y = 0.05; G.sfx('pop', { vol: 0.5 }); G.caption('…피식'); continue; }
              f.state = 'planted';
              h.rotation.set(0, 0, Math.PI); // head first into the sand
              h.position.y = 0.75;
              f.anim.play('idle');
              G.sfx('sand');
              G.shake(8, 0.2);
              G.caption('…머리부터 박혔다');
              G.lose();
            }
          } else if (f.state === 'caught') {
            h.position.x = basket.position.x + f.offset;
            h.position.y = 0.75 + f.stack * 0.32;
          } else if (f.state === 'planted') {
            h.rotation.z = Math.PI + Math.sin(G.t * 30) * 0.06; // legs flailing
          } else if (f.state === 'blown') { // launched out of the basket by the blast
            f.vy -= 14 * dt;
            h.position.x += f.vx * dt;
            h.position.y += f.vy * dt;
            h.rotation.z += 10 * dt;
          } else if (f.state === 'dud') {
            h.scale.multiplyScalar(1 - dt * 1.5);
          }
          if (f.kind === 'bomb' && h.visible) {
            const blink = Math.sin(G.t * 26) > 0;
            f.ball.material.emissiveIntensity = blink ? 0.18 : 0;
            f.spark.scale.setScalar(1 + Math.random() * 1.2);
          }
        }
        if (boomT >= 0) {
          boomT += dt;
          boom.scale.setScalar(0.5 + boomT * 9);
          boom.material.opacity = Math.max(0, 1 - boomT * 1.6);
        }
        void ready;
      },
    };
  },
};
