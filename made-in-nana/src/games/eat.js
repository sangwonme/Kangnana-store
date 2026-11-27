// 06 [BOSS] 먹어라! — 바나나 먹방 대결. 강나나 vs 동우, 각자 옆에 바나나 산더미 (맨 뒤엔 거대 바나나).
// 아무 데나 연타 = 강나나가 한 입씩 (BITES번에 바나나 1개 → 껍질이 앞 껍질 더미로 날아감, 볼이 빵빵).
// 동우는 처음부터 일정한 페이스로 먹는다. L2 = 동우 2명, L3 = 동우 3명이 한 더미를 같이 먹는다 (각자 페이스는 느려서 합치면 공정).
// 목표 연타 속도(이기려면): L1 ≈ 7/s, L2 ≈ 7.5/s, L3 ≈ 8/s. 10 taps/s로도 30초 넘게 연타해야 끝난다.
// 글자 없는 HUD: 아래 막대 하나 — 왼쪽 강나나 얼굴에서 노랑이, 오른쪽 동우(들) 얼굴에서 파랑이 가운데(왕관)로 차오른다.
// 승리: 왕관 + 꽃가루 + 실사 먹방 컷인(eat.jpg), 동우들 쓰러짐. 패배: 강나나 얼굴이 바나나로 빵빵하게 부풀어 뻗음.
import { fitHeight } from '../core/assets.js';

const BITES = 16;         // bites per normal banana (even a 10 taps/s masher needs 30+ s)
const GIANT_BITES = 50;   // the last banana in each pile is a GIANT one
const IMG = {};

export default {
  id: 'eat', no: 6, cmd: '먹어라!', hint: '연타!', bgm: 'bgm_boss', layer: 'both',
  boss: true, duration: 75, timeout: 'lose', afterglow: 2.4,
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
    const N = [18, 21, 24][L - 1];                      // bananas per pile (the last one is giant)
    const DW = L;                                       // number of Dongwoos
    // seconds per normal banana for EACH Dongwoo; combined side ≈ 2.42 / 2.23 / 2.1 s per banana
    // → to win you need ≈ 7 / 7.5 / 8 taps/s (L1/L2/L3)
    const perEach = [2.42, 4.46, 6.3][L - 1];

    // ------------------------------------------------------------------ studio
    scene.background = new THREE.Color('#ff7eb6');
    scene.add(new THREE.HemisphereLight('#ffffff', '#b07090', 2.2));
    const key = new THREE.DirectionalLight('#fff4e0', 2.2);
    key.position.set(2, 5, 6);
    scene.add(key);
    camera.position.set(0, 1.8, 4.8);
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
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.06, 1.3), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    cloth.position.y = TOP;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(3.8, TOP, 0.04), new THREE.MeshLambertMaterial({ color: '#e83a5a' }));
    skirt.position.set(0, TOP / 2, 0.65);
    table.add(cloth, skirt);
    scene.add(table);

    // ------------------------------------------------------------------ sides + eaters
    // a side owns the pile, the peel heap and the eaten count; eaters (1 Gangnana / 1-3 Dongwoos) bite from it
    const mkSide = (sgn, pileX, heapX) => ({ sgn, pileX, heapX, eaten: 0, pile: [], peels: 0, giant: null, eaters: [] });
    const nanaSide = mkSide(-1, -1.2, -0.5);
    const dwX = [[0.55], [0.38, 0.82], [0.25, 0.6, 0.95]][L - 1];
    const dwSide = mkSide(1, 1.3, dwX.reduce((a, b) => a + b, 0) / dwX.length);
    const mkEater = (S, x, z, h) => {
      const base = TOP - 0.55 + (1.55 - h) * 0.75; // smaller Dongwoos sit higher so their faces clear the table
      const e = { S, x, z, h, base, holder: new THREE.Group(), anim: null, head: null, cur: null, bob: 0, puff: 0, bigPuff: 0, state: 'eat', clock: 0 };
      e.holder.position.set(x, base, z);
      scene.add(e.holder);
      S.eaters.push(e);
      return e;
    };
    const nana = mkEater(nanaSide, -0.5, -0.45, 1.55);
    const dwH = [1.55, 1.3, 1.15][L - 1];
    const dws = dwX.map((x, i) => mkEater(dwSide, x, -0.45 - (i % 2) * 0.12, dwH));
    dws.forEach((e, i) => { e.clock = (perEach / BITES) * (i / DW); }); // staggered chomps
    const loadEater = (e, name) => A.instance(name).then(({ root, clips }) => {
      fitHeight(root, e.h);
      e.holder.add(root);
      e.anim = G.animate(root, clips);
      const a = e.anim.play('idle');
      if (a) a.time = Math.random() * 1.5;
      e.head = root.getObjectByName('Head');
    });
    loadEater(nana, 'gangnana_cute');
    dws.forEach((e) => loadEater(e, 'dongwoo_cute'));

    // banana piles: a stepped heap lying on the table (rows of bananas, narrower going up); GIANT one at the back
    let peelTpl = null;
    const piles = A.instance('banana').then(({ root }) => {
      fitHeight(root, 0.26);
      root.rotation.x = Math.PI / 2; // lie flat (length along z, ~0.12 high)
      const tpl = new THREE.Group(); tpl.add(root);
      for (const S of [nanaSide, dwSide]) {
        const giant = tpl.clone();
        giant.scale.setScalar(3.2);
        giant.position.set(S.pileX - S.sgn * 0.05, TOP + 0.16, -0.42);
        giant.rotation.y = Math.PI / 2 + G.rand(-0.1, 0.1);
        giant.userData.giant = true;
        scene.add(giant);
        S.pile.push(giant); // popped last
        // normal bananas: a tall stack, 2 per layer (front + back), lying sideways so you see their length
        for (let k = 0; k < N - 1; k++) {
          const layer = Math.floor(k / 2), row = k % 2;
          const b = tpl.clone();
          b.position.set(S.pileX + G.rand(-0.03, 0.03), TOP + 0.07 + layer * 0.085, 0.1 - row * 0.15);
          b.rotation.y = Math.PI / 2 + (layer % 2 ? Math.PI : 0) + G.rand(-0.12, 0.12);
          scene.add(b);
          S.pile.push(b);
        }
        // pop order: highest layer first
        S.pile.sort((a, b) => (a.userData.giant ? -1 : b.userData.giant ? 1 : a.position.y - b.position.y));
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
    let cutin = 0;            // eat.jpg flash timer (win)
    const confetti = [];

    const mouth = (e) => new THREE.Vector3(e.x, e.base + e.h * 0.77, e.z + 0.47);
    const takeNext = (e) => {
      if (e.cur) return;
      const S = e.S;
      if (S.giant) { e.cur = S.giant; return; }              // everyone piles onto the giant banana
      const b = S.pile.pop();
      if (!b) return;
      e.cur = { b, from: b.position.clone(), t: 0, giant: !!b.userData.giant, s0: b.scale.x, bites: 0, holder: e };
      if (e.cur.giant) S.giant = e.cur;
    };
    const finishBanana = (e) => {
      const cur = e.cur, S = e.S;
      scene.remove(cur.b);
      for (const o of S.eaters) if (o.cur === cur) o.cur = null;
      if (cur.giant) S.giant = null;
      S.eaten++;
      // the peel flies to the heap in front
      if (peelTpl) {
        const p = peelTpl.clone();
        const from = mouth(cur.holder);
        p.position.copy(from);
        p.scale.multiplyScalar(cur.giant ? 3 : 1);
        scene.add(p);
        const to = new THREE.Vector3(S.heapX + G.rand(-0.14, 0.14), TOP + 0.03 + Math.min(0.5, S.peels * 0.018), 0.38 + G.rand(-0.08, 0.08));
        S.peels++;
        flying.push({ p, from, to, t: 0 });
      }
      if (S === nanaSide) G.sfx('slurp', { vol: 0.7, rate: G.rand(1.1, 1.3) });
      else G.sfx('shared:banana_pick', { vol: 0.35, rate: 0.9 });
      if (S.eaten >= N) { end(S === nanaSide ? 'win' : 'lose'); return; }
      for (const o of S.eaters) takeNext(o);
    };
    const bite = (e) => {
      takeNext(e);
      if (!e.cur) return;
      e.cur.bites++;
      e.bob = 1;
      e.puff = Math.min(1, e.puff + 0.3);
      if (e === nana) G.sfx('shared:food_plop', { vol: 0.6, rate: G.rand(1.2, 1.6) });
      if (e.cur.bites >= (e.cur.giant ? GIANT_BITES : BITES)) finishBanana(e);
    };

    const end = (r) => {
      if (result) return;
      result = r; endT = 0;
      if (r === 'win') {
        G.sfx('sparkle'); G.sfx('c8_coin');
        crown.visible = true;
        nana.anim?.play('cheer');
        for (const d of dws) { d.anim?.play('fall', { loop: false }); d.state = 'down'; }
        cutin = 1.6;
        for (let i = 0; i < 90; i++) confetti.push({ x: G.rand(0, 600), y: G.rand(-300, 0), vy: G.rand(160, 320), vx: G.rand(-40, 40), r: G.rand(0, 6), col: G.pick(['#ffd400', '#ff5a5f', '#3ec1d3', '#7bd389', '#ffffff']) });
        G.win();
      } else {
        G.sfx('glug'); setTimeout(() => G.sfx('deflate', { vol: 0.7, rate: 0.7 }), 300);
        for (const d of dws) d.anim?.play('cheer');
        nana.state = 'stuffed';
        G.lose();
      }
    };

    G.dbg = { get nana() { return nanaSide.eaten; }, get dw() { return dwSide.eaten; }, N }; // for playtests

    return {
      down() { if (!result) bite(nana); },
      timeout() { if (!result) end('lose'); },
      update(dt) {
        void piles;
        // Dongwoos: steady bites from t = 0, very slightly faster as the contest goes on
        if (!result && dt > 0) {
          const pace = perEach * G.lerp(1.05, 0.95, Math.min(1, G.t / 40));
          for (const d of dws) {
            d.clock -= dt;
            if (d.clock <= 0) { d.clock += pace / BITES; bite(d); if (result) break; }
          }
        }

        for (const e of [nana, ...dws]) {
          e.bob = Math.max(0, e.bob - dt * 8);
          e.puff = Math.max(0, e.puff - dt * 0.8);
          e.holder.position.y = e.base + e.bob * 0.04;
          e.holder.rotation.x = e.bob * 0.12;
          let hs = 1 + e.puff * 0.18;
          if (e.state === 'stuffed') { e.bigPuff = Math.min(1, e.bigPuff + dt * 1.6); hs = 1 + e.bigPuff * 1.1 + Math.sin(G.t * 30) * 0.03; }
          if (e.head) e.head.scale.set(hs * 1.05, hs * 0.97, hs);
        }
        // bananas in hand travel to the taker's mouth and shrink bite by bite
        for (const S of [nanaSide, dwSide]) {
          const curs = new Set(S.eaters.map((e) => e.cur).filter(Boolean));
          for (const cur of curs) {
            cur.t = Math.min(1, cur.t + dt * 6);
            const h = cur.holder;
            const m = mouth(h).add(cur.giant ? new THREE.Vector3(-S.sgn * 0.25, -0.1, 0.25) : new THREE.Vector3(S.sgn * 0.1, -0.05, 0.1));
            cur.b.position.lerpVectors(cur.from, m, cur.t);
            cur.b.rotation.set(0, 0, -S.sgn * 0.9);
            const s = 1 - cur.bites / (cur.giant ? GIANT_BITES : BITES) * 0.75;
            cur.b.scale.set(cur.s0, cur.s0 * s, cur.s0);
          }
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
          if (f.t >= 1) { f.p.rotation.set(0, G.rand(0, 6), 0); flying.splice(i, 1); G.sfx('splat', { vol: 0.2, rate: 1.6 }); }
        }
        // crown floats onto the winner
        if (crown.visible && nana.head) {
          const hp = nana.head.getWorldPosition(new THREE.Vector3());
          crown.position.set(hp.x, hp.y + 0.78 + Math.max(0, 0.6 - endT * 1.5), hp.z);
          crown.material.rotation = Math.sin(G.t * 3) * 0.12; // proud wobble
        }
        if (result) endT += dt;

        this.hud(dt);
      },

      hud(dt) {
        // race bar: yellow grows from Gangnana's face, blue from the Dongwoo side; first to the crown in the middle wins
        const y = 712, x0 = 92, x1 = 508, mid = 300, h = 26; // bottom: the top of the frame is the stage
        c.save();
        c.fillStyle = 'rgba(0,0,0,0.45)';
        c.beginPath(); c.roundRect(x0 - 6, y - h / 2 - 6, x1 - x0 + 12, h + 12, 18); c.fill();
        c.fillStyle = '#ffd400';
        c.fillRect(x0, y - h / 2, (mid - x0) * Math.min(1, nanaSide.eaten / N), h);
        c.fillStyle = '#4aa8ff';
        const wd = (x1 - mid) * Math.min(1, dwSide.eaten / N);
        c.fillRect(x1 - wd, y - h / 2, wd, h);
        c.fillStyle = '#fff';
        c.fillRect(mid - 2, y - h / 2 - 8, 4, h + 16);
        // tiny crown marker at the finish line
        c.fillStyle = '#ffcc00'; c.strokeStyle = '#1b1306'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(mid - 16, y - 22); c.lineTo(mid - 16, y - 36); c.lineTo(mid - 8, y - 28); c.lineTo(mid, y - 40); c.lineTo(mid + 8, y - 28);
        c.lineTo(mid + 16, y - 36); c.lineTo(mid + 16, y - 22); c.closePath(); c.fill(); c.stroke();
        // faces (one Dongwoo face per Dongwoo, stacked)
        const face = (img, sx, sy, sw, sh, cx, cy, r) => {
          c.save();
          c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fillStyle = '#fff'; c.fill(); c.clip();
          if (img) c.drawImage(img, sx, sy, sw, sh, cx - r, cy - r, r * 2, r * 2);
          c.restore();
          c.beginPath(); c.arc(cx, cy, r, 0, 7); c.lineWidth = 4; c.strokeStyle = '#1b1306'; c.stroke();
        };
        face(IMG.nana, 30, 70, 140, 140, 50, y, 34);
        for (let i = DW - 1; i >= 0; i--) face(IMG.dw, 235, 12, 105, 105, 550 - i * 6, y - i * 30, i ? 26 : 34);
        c.restore();

        // real 먹방 cut-in (eat.jpg) at the win
        if (cutin > 0 && IMG.eat && result === 'win') {
          cutin -= dt;
          if (endT >= 0.6) { // let the crown + collapse read first
            const a = Math.min(1, cutin * 4);
            const w = 210, hh = w * 1.2;
            c.save();
            c.globalAlpha = a;
            c.translate(440, 215); // on the studio wall, clear of the faces
            c.rotate(0.07);
            c.fillStyle = '#fff';
            c.fillRect(-w / 2 - 8, -hh / 2 - 8, w + 16, hh + 16);
            c.drawImage(IMG.eat, 80, 150, 520, 624, -w / 2, -hh / 2, w, hh);
            c.restore();
          }
          cutin = Math.max(cutin, 0.3); // keep it up through the afterglow
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
