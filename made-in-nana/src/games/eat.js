// 06 [BOSS] 먹어라! — 바나나 먹방 대결. 강나나 vs 동우, 각자 앞에 바나나 산더미.
// 아무 데나 연타 = 강나나가 한 입씩 (BITES번에 바나나 1개 → 껍질이 옆 껍질 더미로 날아감, 볼이 빵빵).
// 동우는 일정한 페이스로 먹고 점점 빨라진다 (G.level 로 더 빠르게, 더미도 커짐).
// 글자 없는 HUD: 위쪽 막대 하나 — 왼쪽 강나나 얼굴에서 노랑이, 오른쪽 동우 얼굴에서 파랑이 가운데(왕관)로 차오른다.
// 승리: 왕관 + 꽃가루 + 실사 먹방 컷인(eat.jpg), 동우 쓰러짐. 패배: 강나나 얼굴이 바나나로 빵빵하게 부풀어 뻗음.
import { fitHeight } from '../core/assets.js';

const BITES = 3;          // bites per normal banana
const GIANT_BITES = 12;   // the last banana in each pile is a GIANT one
const IMG = {};

export default {
  id: 'eat', no: 6, cmd: '먹어라!', hint: '연타!', bgm: 'bgm_boss', layer: 'both',
  boss: true, duration: 20, timeout: 'lose', afterglow: 2.4,
  sounds: ['slurp', 'splat', 'sparkle', 'c8_coin', 'pop', 'glug', 'boing', 'thud', 'deflate', 'shared:food_plop', 'shared:banana_pick'],

  async load(A) {
    await Promise.all(['gangnana_cute', 'dongwoo_cute', 'banana', 'peel'].map((n) => A.glb(n)));
    [IMG.eat, IMG.nana, IMG.dw] = await Promise.all([A.img('eat.jpg'), A.img('suit_head.png'), A.img('dongwoo.png')]);
  },

  create(G) {
    const { THREE, A, scene, camera } = G;
    const L = G.level;
    const c = G.c2d;
    G.showTimer = false;
    // Dongwoo eats twice as fast as before; needed mash rate to win ≈ 5.4 / 6.1 / 7.2 taps/s (L1/L2/L3)
    const N = [6, 7, 8][L - 1];                         // bananas per pile (the last one is giant)
    const aiStart = [0.62, 0.55, 0.47][L - 1];          // s per normal banana for Dongwoo at the start
    const aiEnd = [0.47, 0.42, 0.37][L - 1];            // ... and near the end (he speeds up)

    // ------------------------------------------------------------------ studio
    scene.background = new THREE.Color('#ff7eb6');
    scene.add(new THREE.HemisphereLight('#ffffff', '#b07090', 2.2));
    const key = new THREE.DirectionalLight('#fff4e0', 2.2);
    key.position.set(2, 5, 6);
    scene.add(key);
    camera.position.set(0, 1.7, 4.3);
    camera.lookAt(0, 1.32, 0);

    const stripes = document.createElement('canvas');
    stripes.width = 256; stripes.height = 16;
    {
      const x = stripes.getContext('2d');
      for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#ff9ccb' : '#ffd23f'; x.fillRect(i * 16, 0, 16, 16); }
    }
    const st = new THREE.CanvasTexture(stripes);
    st.colorSpace = THREE.SRGBColorSpace;
    st.wrapS = THREE.RepeatWrapping;
    st.repeat.set(2, 1);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshLambertMaterial({ map: st }));
    wall.position.set(0, 3, -2.5);
    scene.add(wall);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshLambertMaterial({ color: '#7a4ad0' }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // table with a cloth
    const TOP = 0.78;
    const table = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 1.2), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    cloth.position.y = TOP;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(3.6, TOP, 0.04), new THREE.MeshLambertMaterial({ color: '#e83a5a' }));
    skirt.position.set(0, TOP / 2, 0.6);
    table.add(cloth, skirt);
    scene.add(table);

    // ------------------------------------------------------------------ eaters
    const mkEater = (side) => {
      const e = {
        side, x: side * 0.5, holder: new THREE.Group(), anim: null, head: null,
        eaten: 0, bites: 0, bob: 0, puff: 0, bigPuff: 0, pile: [], peels: 0, cur: null, state: 'eat',
      };
      e.holder.position.set(e.x, TOP - 0.55, -0.45);
      scene.add(e.holder);
      return e;
    };
    const nana = mkEater(-1);
    const dw = mkEater(1);
    const loadEater = (e, name) => A.instance(name).then(({ root, clips }) => {
      fitHeight(root, 1.55);
      e.holder.add(root);
      e.anim = G.animate(root, clips);
      e.anim.play('idle');
      e.head = root.getObjectByName('Head');
    });
    loadEater(nana, 'gangnana_cute');
    loadEater(dw, 'dongwoo_cute');

    // banana piles (pyramids lying on the table in front of each eater)
    let bananaTpl = null;
    let peelTpl = null;
    const piles = A.instance('banana').then(({ root }) => {
      fitHeight(root, 0.3);
      root.rotation.z = Math.PI / 2; // lie down
      const g = new THREE.Group(); g.add(root);
      bananaTpl = g;
      // a tall tower, 2 bananas per layer, crossing like a log stack
      for (const e of [nana, dw]) {
        for (let k = 0; k < N; k++) {
          const b = bananaTpl.clone();
          if (k === 0) { // the finale: a GIANT banana lying behind the stack
            b.scale.setScalar(3.2);
            b.position.set(e.x + e.side * 0.62, TOP + 0.16, -0.32);
            b.rotation.y = G.rand(-0.1, 0.1);
            b.userData.giant = true;
            scene.add(b);
            e.pile.push(b);
            continue;
          }
          const layer = Math.floor(k / 2), i = k % 2;
          const cross = layer % 2;
          b.position.set(e.x + e.side * 0.55 + (cross ? 0 : (i - 0.5) * 0.14), TOP + 0.06 + layer * 0.12, 0.05 + (cross ? (i - 0.5) * 0.14 : 0));
          b.rotation.y = cross ? Math.PI / 2 + G.rand(-0.15, 0.15) : G.rand(-0.15, 0.15);
          scene.add(b);
          e.pile.push(b);
        }
      }
    });
    A.instance('peel').then(({ root }) => { fitHeight(root, 0.12); peelTpl = root; });
    const flying = [];

    // crown (win): Meshy-generated crown image as a sprite (assets/img/crown.png)
    const crown = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    crown.scale.set(0.62, 0.54, 1);
    crown.renderOrder = 10;
    crown.visible = false;
    scene.add(crown);
    A.texture('crown.png').then((t) => { crown.material.map = t; crown.material.needsUpdate = true; });

    // ------------------------------------------------------------------ eating
    let result = null;
    let endT = 0;
    let cutin = 0;            // eat.jpg flash timer
    const confetti = [];

    const mouth = (e) => new THREE.Vector3(e.x, TOP + 0.42, 0.02);
    const takeNext = (e) => {
      const b = e.pile.pop();
      if (!b) return;
      e.cur = { b, from: b.position.clone(), t: 0, giant: !!b.userData.giant, s0: b.scale.x };
    };
    const finishBanana = (e) => {
      if (e.cur) { scene.remove(e.cur.b); e.cur = null; }
      e.eaten++;
      e.bites = 0;
      // the peel flies to the side pile
      if (peelTpl) {
        const p = peelTpl.clone();
        const from = mouth(e);
        p.position.copy(from);
        scene.add(p);
        const to = new THREE.Vector3(e.x + e.side * 0.08 + G.rand(-0.1, 0.1), TOP + 0.03 + e.peels * 0.03, 0.3 + G.rand(-0.06, 0.06));
        e.peels++;
        flying.push({ p, from, to, t: 0 });
      }
      if (e === nana) {
        G.sfx('slurp', { vol: 0.7, rate: G.rand(1.1, 1.3) });
      } else G.sfx('shared:banana_pick', { vol: 0.4, rate: 0.9 });
      if (e.eaten >= N) end(e === nana ? 'win' : 'lose');
      else takeNext(e);
    };
    const bite = (e) => {
      if (!e.cur) takeNext(e);
      if (!e.cur) return;
      e.bites++;
      e.bob = 1;
      e.puff = Math.min(1, e.puff + 0.35);
      if (e === nana) G.sfx('shared:food_plop', { vol: 0.7, rate: G.rand(1.2, 1.6) });
      if (e.bites >= (e.cur.giant ? GIANT_BITES : BITES)) finishBanana(e);
    };

    const end = (r) => {
      if (result) return;
      result = r; endT = 0;
      if (r === 'win') {
        G.sfx('sparkle'); G.sfx('c8_coin');
        crown.visible = true;
        nana.anim?.play('cheer');
        dw.anim?.play('fall', { loop: false });
        dw.state = 'down';
        cutin = 1.6;
        for (let i = 0; i < 90; i++) confetti.push({ x: G.rand(0, 600), y: G.rand(-300, 0), vy: G.rand(160, 320), vx: G.rand(-40, 40), r: G.rand(0, 6), col: G.pick(['#ffd400', '#ff5a5f', '#3ec1d3', '#7bd389', '#ffffff']) });
        G.win();
      } else {
        G.sfx('glug'); setTimeout(() => G.sfx('deflate', { vol: 0.7, rate: 0.7 }), 300);
        dw.anim?.play('cheer');
        nana.state = 'stuffed';
        G.lose();
      }
    };

    G.dbg = { get nana() { return nana.eaten; }, get dw() { return dw.eaten; }, N }; // for playtests

    let aiClock = 1.3; // Dongwoo starts after the command card
    return {
      down() { if (!result) bite(nana); },
      timeout() { if (!result) end('lose'); },
      update(dt) {
        void piles;
        // Dongwoo: steady bites, speeding up over time
        if (!result && G.t > 1.2) {
          const prog = G.clamp(dw.eaten / N, 0, 1);
          const behind = nana.eaten > dw.eaten ? 0.85 : 1; // rubber band: he eats faster when Gangnana leads
          const perBanana = G.lerp(aiStart, aiEnd, Math.min(1, G.t / 14) * 0.7 + prog * 0.3) * behind;
          aiClock -= dt;
          if (aiClock <= 0) { aiClock += perBanana / BITES; bite(dw); } // same pace per bite, so the giant takes him a while too
        }

        for (const e of [nana, dw]) {
          e.bob = Math.max(0, e.bob - dt * 8);
          e.puff = Math.max(0, e.puff - dt * 0.8);
          // the banana in hand travels to the mouth and shrinks bite by bite
          if (e.cur) {
            e.cur.t = Math.min(1, e.cur.t + dt * 6);
            const m = mouth(e);
            e.cur.b.position.lerpVectors(e.cur.from, m.clone().add(new THREE.Vector3(e.side * -0.12, -0.05, 0.12)), e.cur.t);
            e.cur.b.rotation.set(0, 0, e.side * 0.9);
            const s = 1 - e.bites / (e.cur.giant ? GIANT_BITES : BITES) * 0.75;
            e.cur.b.scale.set(e.cur.s0, e.cur.s0 * s, e.cur.s0);
          }
          e.holder.position.y = TOP - 0.55 + e.bob * 0.04;
          e.holder.rotation.x = e.bob * 0.12;
          let hs = 1 + e.puff * 0.18;
          if (e.state === 'stuffed') { e.bigPuff = Math.min(1, e.bigPuff + dt * 1.6); hs = 1 + e.bigPuff * 1.1 + Math.sin(G.t * 30) * 0.03; }
          if (e.head) e.head.scale.set(hs * 1.05, hs * 0.97, hs);
        }
        if (nana.state === 'stuffed') {
          nana.holder.rotation.z = G.lerp(nana.holder.rotation.z, 0.5, dt * 2);
          nana.holder.position.y -= nana.bigPuff * 0.08;
        }
        // flying peels
        for (let i = flying.length - 1; i >= 0; i--) {
          const f = flying[i];
          f.t = Math.min(1, f.t + dt * 2.6);
          f.p.position.lerpVectors(f.from, f.to, f.t);
          f.p.position.y += Math.sin(f.t * Math.PI) * 0.5;
          f.p.rotation.z += dt * 12;
          if (f.t >= 1) { f.p.rotation.set(0, G.rand(0, 6), 0); flying.splice(i, 1); G.sfx('splat', { vol: 0.25, rate: 1.6 }); }
        }
        // crown floats onto the winner
        if (crown.visible && nana.head) {
          endT += 0;
          const hp = nana.head.getWorldPosition(new THREE.Vector3());
          crown.position.set(hp.x, hp.y + 0.78 + Math.max(0, 0.6 - endT * 1.5), hp.z);
          crown.material.rotation = Math.sin(G.t * 3) * 0.12; // proud wobble
        }
        if (result) endT += dt;

        this.hud(dt);
      },

      hud(dt) {
        // race bar: yellow grows from Gangnana's face, blue from Dongwoo's; first to the crown in the middle wins
        const y = 712, x0 = 92, x1 = 508, mid = 300, h = 26; // bottom: the top of the frame is the stage
        c.save();
        c.fillStyle = 'rgba(0,0,0,0.45)';
        c.beginPath(); c.roundRect(x0 - 6, y - h / 2 - 6, x1 - x0 + 12, h + 12, 18); c.fill();
        c.fillStyle = '#ffd400';
        c.fillRect(x0, y - h / 2, (mid - x0) * Math.min(1, nana.eaten / N), h);
        c.fillStyle = '#4aa8ff';
        const wd = (x1 - mid) * Math.min(1, dw.eaten / N);
        c.fillRect(x1 - wd, y - h / 2, wd, h);
        c.fillStyle = '#fff';
        c.fillRect(mid - 2, y - h / 2 - 8, 4, h + 16);
        // tiny crown marker at the finish line
        c.fillStyle = '#ffcc00'; c.strokeStyle = '#1b1306'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(mid - 16, y - 22); c.lineTo(mid - 16, y - 36); c.lineTo(mid - 8, y - 28); c.lineTo(mid, y - 40); c.lineTo(mid + 8, y - 28);
        c.lineTo(mid + 16, y - 36); c.lineTo(mid + 16, y - 22); c.closePath(); c.fill(); c.stroke();
        // faces
        const face = (img, sx, sy, sw, sh, cx) => {
          c.save();
          c.beginPath(); c.arc(cx, y, 34, 0, 7); c.fillStyle = '#fff'; c.fill(); c.clip();
          if (img) c.drawImage(img, sx, sy, sw, sh, cx - 34, y - 34, 68, 68);
          c.restore();
          c.beginPath(); c.arc(cx, y, 34, 0, 7); c.lineWidth = 4; c.strokeStyle = '#1b1306'; c.stroke();
        };
        face(IMG.nana, 30, 70, 140, 140, 50);
        face(IMG.dw, 235, 12, 105, 105, 550);
        c.restore();

        // real 먹방 cut-in (eat.jpg) on every 3rd banana, big on the win
        if (cutin > 0 && IMG.eat) {
          cutin -= dt;
          const big = result === 'win';
          const a = Math.min(1, cutin * 4);
          if (big && endT < 0.6) { /* let the crown + collapse read first */ } else {
          const w = big ? 210 : 120, hh = w * 1.2;
          const cx = big ? 440 : 115, cy = big ? 215 : 190; // on the studio wall, clear of the faces
          c.save();
          c.globalAlpha = a;
          c.translate(cx, cy);
          c.rotate(big ? 0.07 : -0.12);
          c.fillStyle = '#fff';
          c.fillRect(-w / 2 - 8, -hh / 2 - 8, w + 16, hh + 16);
          c.drawImage(IMG.eat, 80, 150, 520, 624, -w / 2, -hh / 2, w, hh);
          c.restore();
          }
          if (big) cutin = Math.max(cutin, 0.3); // keep it up through the afterglow
        }
        // confetti
        for (const p of confetti) {
          p.y += p.vy * dt; p.x += p.vx * dt; p.r += dt * 6;
          c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.col; c.fillRect(-6, -3, 12, 6); c.restore();
        }
        // stuffed: a woozy green tint
        if (result === 'lose') {
          c.fillStyle = `rgba(120,200,60,${Math.min(0.25, endT * 0.3)})`;
          c.fillRect(0, 0, 600, 800);
        }
      },
    };
  },
};
