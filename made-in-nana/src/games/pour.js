// 10 따라라! — 소주잔에 바나나우유를 선까지 따른다. 홀드하면 따르고 떼면 멈춤. 넘치면 실패. (실사 술집 배경 + 3D 소품)
// The banana-milk jar, the shot glass, the milk, the stream and the puddle are procedural three.js meshes (layer 'both').
// The bar photo + wooden table (assets/photo/pour_table.jpg) is the scene background; the target line and texts are 2D on top.
// World units: table top is y = 0, the glass stands at (gx, 0, 0).

let IMG = null;
const MILK = '#fff0a0';
const GL = { h: 0.85, rIn0: 0.232, rIn1: 0.278, floor: 0.14 }; // glass: height, inner radius bottom/top, inner floor height
const JAR = { x: -0.345, y: 1.35, rest: 0.3, pour: 2.1, mouth: 0.4 }; // jar pivot (its centre), tilt angles, mouth offset
const UNDER = 0.2; // the stream lands in the glass when |gx| < UNDER (stream falls at x = 0)

export default {
  id: 'pour', no: 10, cmd: '따라라!', hint: '꾹 누르고 · 떼기', bgm: 'bgm_kitchen', layer: 'both',
  duration: 5, timeout: 'lose', sounds: ['glug', 'slurp', 'splash', 'thud', 'sparkle', 'tap', 'pop'],

  async load(A) {
    const [bar, wood, head] = await Promise.all([A.img('bar.jpg'), A.img('assets/photo/pour_table.jpg'), A.texture('suit_head.png')]);
    const bg = document.createElement('canvas');
    bg.width = 600; bg.height = 800;
    const x = bg.getContext('2d');
    const s = 600 / bar.width;
    x.filter = 'blur(1.5px) brightness(0.85)';
    x.drawImage(bar, 0, -70, 600, bar.height * s);
    x.filter = 'none';
    // wooden table: photo texture, warmed up with a multiply tint, darker towards the viewer
    x.drawImage(wood, 0, 0, wood.width, wood.height * 0.6, 0, 590, 600, 210);
    x.globalCompositeOperation = 'multiply';
    const g = x.createLinearGradient(0, 590, 0, 800);
    g.addColorStop(0, '#d0763a');
    g.addColorStop(1, '#6a2a0e');
    x.fillStyle = g;
    x.fillRect(0, 590, 600, 210);
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = 'rgba(255,200,150,0.35)';
    x.fillRect(0, 588, 600, 5);
    const bgTex = new A.THREE.CanvasTexture(bg);
    bgTex.colorSpace = A.THREE.SRGBColorSpace;
    IMG = { bgTex, head };
  },

  create(G) {
    const { THREE, scene, camera } = G;
    const c = G.c2d;
    const line = G.rand(0.42, 0.8);
    const tol = [0.1, 0.075, 0.065][G.level - 1];
    const rate = 0.42 * G.speed;
    let fill = 0;
    let flow = 0;
    let holding = false;
    let released = false;
    let tilt = JAR.rest;
    let gx = 0;
    let spill = 0; // puddle size 0..1
    let spillX = 0;
    let resultT = 0;
    let fate = null; // 'drink' | 'over' | 'thirsty' | 'line'
    let glug = null;
    let drops = []; // 2D milk splash when the head pops out

    // ---------------------------------------------------------------- scene
    scene.background = IMG.bgTex;
    scene.add(new THREE.HemisphereLight('#fff4e0', '#5a3420', 1.7));
    const sun = new THREE.DirectionalLight('#ffffff', 2.4);
    sun.position.set(-2, 3, 3);
    scene.add(sun);
    const rim = new THREE.DirectionalLight('#ffd9b0', 1.2);
    rim.position.set(2.5, 1.5, -1);
    scene.add(rim);
    camera.position.set(0, 1.4, 2.4);
    camera.lookAt(0, 0.95, 0);

    const milkMat = new THREE.MeshPhongMaterial({ color: MILK, emissive: '#3a3000', shininess: 40 });
    const lathe = (pts, mat, seg = 48) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);

    // shot glass: outer wall up, inner wall down (one lathe = a thick-walled cup with a solid base)
    const glass = new THREE.Group();
    scene.add(glass);
    const glassMat = new THREE.MeshPhongMaterial({ color: '#eaf7ff', specular: '#ffffff', shininess: 160, transparent: true, opacity: 0.32,
      side: THREE.DoubleSide, depthWrite: false });
    const cup = lathe([[0, 0], [0.235, 0], [0.247, 0.02], [0.252, 0.12], [0.3, GL.h], [0.292, GL.h + 0.008], [GL.rIn1, GL.h],
      [GL.rIn0, GL.floor], [0, GL.floor]], glassMat);
    cup.renderOrder = 2;
    glass.add(cup);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.009, 8, 48), new THREE.MeshPhongMaterial({ color: '#ffffff', transparent: true,
      opacity: 0.55, shininess: 200, depthWrite: false }));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = GL.h;
    lip.renderOrder = 2;
    glass.add(lip);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    glass.add(shadow);

    // milk inside: a cylinder whose rings we move every frame so it always hugs the tapered inner wall
    const milkGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1);
    const pos = milkGeo.attributes.position;
    const orig = Float32Array.from(pos.array);
    const milk = new THREE.Mesh(milkGeo, milkMat);
    glass.add(milk);
    const rAt = (y) => GL.rIn0 + (GL.rIn1 - GL.rIn0) * (y - GL.floor) / (GL.h - GL.floor);
    const levelY = (f) => GL.floor + f * (GL.h - GL.floor);
    const setMilk = (f) => {
      milk.visible = f > 0.005;
      const top = levelY(Math.min(f, 1.05));
      const rt = rAt(Math.min(top, GL.h)) - 0.003;
      const rb = GL.rIn0 - 0.003;
      for (let i = 0; i < pos.count; i++) {
        const up = orig[i * 3 + 1] > 0;
        const r = up ? rt : rb;
        pos.setXYZ(i, orig[i * 3] * r, up ? top + Math.sin(G.t * 14 + orig[i * 3] * 3) * 0.004 * flow : GL.floor, orig[i * 3 + 2] * r);
      }
      pos.needsUpdate = true;
      milkGeo.computeBoundingSphere();
    };

    // the iconic squat banana-milk jar: round bulb, a ridge, a cone up to the neck
    const jar = new THREE.Group();
    jar.position.set(JAR.x, JAR.y, 0);
    scene.add(jar);
    const jarMat = new THREE.MeshPhongMaterial({ color: '#f6e07c', emissive: '#4a3600', specular: '#ffffff', shininess: 90, transparent: true, opacity: 0.96 });
    const body = lathe([[0, -0.4], [0.22, -0.4], [0.29, -0.37], [0.33, -0.3], [0.345, -0.2], [0.34, -0.1], [0.32, -0.04], [0.3, 0], [0.312, 0.02],
      [0.3, 0.05], [0.27, 0.15], [0.23, 0.26], [0.19, 0.33], [0.17, 0.36], [0.17, JAR.mouth]], jarMat);
    jar.add(body);
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.022, 10, 36), new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 60 }));
    neck.rotation.x = Math.PI / 2;
    neck.position.y = JAR.mouth;
    jar.add(neck);
    const inside = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), milkMat);
    inside.rotation.x = -Math.PI / 2;
    inside.position.y = JAR.mouth - 0.02;
    jar.add(inside);

    // stream + puddle
    const streamGeo = new THREE.CylinderGeometry(1, 0.8, 1, 12, 1, true);
    streamGeo.translate(0, -0.5, 0);
    const stream = new THREE.Mesh(streamGeo, milkMat);
    scene.add(stream);
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 40), milkMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(0, 0.004, 0.05);
    puddle.visible = false;
    scene.add(puddle);

    // success: Gangnana's head pops up out of the milk
    const headSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: IMG.head, transparent: true, alphaTest: 0.5 }));
    // narrower than the inside of the glass, drawn before the glass so the glass wall and rim are blended over it,
    // and hidden under the milk (the opaque milk writes depth) until it rises
    headSprite.scale.set(0.4, 0.43, 1);
    headSprite.visible = false;
    headSprite.renderOrder = 1;
    glass.add(headSprite);

    const mouthWorld = () => jar.localToWorld(new THREE.Vector3(0, JAR.mouth, 0));
    const under = () => Math.abs(gx) < UNDER;
    const glassX = () => (G.level === 3 && !G.result ? Math.sin(G.t * 1.5 * G.speed) * 0.27 : gx);

    // ---------------------------------------------------------------- 2D overlay
    const drawLine = () => {
      const ly = levelY(line);
      const r = rAt(ly) + 0.07;
      const p0 = G.toScreen(new THREE.Vector3(gx - r, ly, 0));
      const p1 = G.toScreen(new THREE.Vector3(gx + r, ly, 0));
      const b0 = G.toScreen(new THREE.Vector3(gx, levelY(line + tol), 0));
      const b1 = G.toScreen(new THREE.Vector3(gx, levelY(line - tol), 0));
      c.save();
      c.fillStyle = 'rgba(80,255,120,0.22)';
      c.fillRect(p0.x + 14, b0.y, p1.x - p0.x - 28, b1.y - b0.y);
      c.setLineDash([14, 8]);
      c.lineWidth = 5;
      c.strokeStyle = '#ff2d55';
      c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
      c.restore();
      G.text('여기까지', p1.x + 8, p1.y - 2, { size: 26, color: '#ff2d55', stroke: '#fff', align: 'left' });
    };

    const draw2D = () => {
      if (!G.result) drawLine();
      for (const d of drops) {
        c.fillStyle = MILK;
        c.beginPath(); c.arc(d.x, d.y, d.r, 0, Math.PI * 2); c.fill();
      }
    };

    const lose = (why) => {
      if (G.result) return;
      fate = why;
      G.lose();
      G.sfx(why === 'over' ? 'splash' : 'thud');
      G.shake(10, 0.3);
    };

    return {
      get state() { return { fill, line, tol, gx }; }, // read by playtests
      down() { holding = true; released = false; },
      up() { holding = false; released = true; },
      update(dt) {
        if (!G.result) gx = glassX();
        glass.position.x = gx;
        const want = holding && !G.result ? 1 : 0;
        tilt += ((want ? JAR.pour : JAR.rest) - tilt) * Math.min(1, dt * 16);
        jar.rotation.z = -tilt;
        flow = want ? Math.min(1, flow + dt * 9) : Math.max(0, flow - dt * 10);
        if (flow > 0 && !glug) glug = G.sfx('glug', { loop: true, vol: 0.6 });
        if (flow === 0 && glug) { glug.stop(); glug = null; }
        if (flow > 0 && !G.result) {
          if (under()) fill += flow * rate * dt;
          else { spill = Math.min(1, spill + flow * dt * 0.6); spillX = 0; }
        }
        if (G.result === 'lose' && fate === 'over') { fill = 1.05; spillX = gx; spill = Math.min(1, spill + dt * 1.5); }
        if (!G.result) {
          if (fill >= 1) lose('over');
          else if (released && flow === 0 && fill > 0) {
            released = false;
            if (Math.abs(fill - line) <= tol) {
              fate = 'drink';
              G.win();
              G.sfx('tap', { rate: 1.6 });
              G.sfx('sparkle', { vol: 0.5 });
              setTimeout(() => { G.sfx('splash', { vol: 0.6 }); G.sfx('pop'); }, 150);
            } else if (fill > line + tol) lose('line');
          }
        }
        if (G.result) resultT += dt;

        // milk, stream, puddle
        setMilk(fill);
        const m = mouthWorld();
        const showStream = flow > 0.02 && tilt > 1.5;
        stream.visible = showStream;
        if (showStream) {
          const bottom = under() ? levelY(Math.min(1, fill)) : 0;
          stream.position.set(m.x, m.y, 0);
          stream.scale.set(0.02 + flow * 0.025, Math.max(0.01, m.y - bottom), 0.02 + flow * 0.025);
        }
        puddle.visible = spill > 0;
        puddle.position.x = spillX;
        puddle.scale.set(0.25 + spill * 0.6, 0.12 + spill * 0.25, 1);

        // win: the head rises out of the milk, milk splashes
        if (G.result === 'win') {
          const k = Math.min(1, resultT / 0.3);
          const bounce = k < 1 ? 1 - (1 - k) ** 2 : 1 + Math.sin((resultT - 0.3) * 18) * 0.04 * Math.max(0, 1 - (resultT - 0.3) * 2);
          headSprite.visible = true;
          headSprite.position.set(0, levelY(fill) - 0.24 + bounce * 0.42, 0);
          if (resultT > 0.12 && resultT < 0.4 && drops.length < 30) {
            const s = G.toScreen(new THREE.Vector3(gx, levelY(fill), 0));
            for (let i = 0; i < 3; i++) drops.push({ x: s.x + G.rand(-60, 60), y: s.y, vx: G.rand(-260, 260), vy: G.rand(-700, -300), r: G.rand(5, 11) });
          }
        }
        drops = drops.filter((d) => { d.vy += 1800 * dt; d.x += d.vx * dt; d.y += d.vy * dt; return d.y < 820; });
        draw2D();
      },
      timeout(r) {
        if (r === 'lose' && !fate) {
          fate = 'thirsty';
          G.sfx('thud');
        }
      },
      dispose() { glug?.stop(); },
    };
  },
};
