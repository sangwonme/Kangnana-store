// The dingy basement corridor the walls come down: tiles, concrete, rails, flickering tubes, junk, a hand-painted scoreboard.
import * as THREE from 'three';

const CW = 6.4, CH = 4.2, Z0 = 8, Z1 = -54; // corridor width/height, near/far end

function rep(t, x, y) {
  const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(x, y); c.needsUpdate = true; return c;
}

function fitTo(obj, size) {
  const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(size / Math.max(s.x, s.y, s.z));
  return obj;
}

export function buildStage(scene, tex, props) {
  const L = Z0 - Z1, zc = (Z0 + Z1) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CW, L), new THREE.MeshStandardMaterial({ map: rep(tex.tile, CW / 1.6, L / 1.6), roughness: 0.75, color: 0xb8b0a0 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = zc; floor.receiveShadow = true;
  const wallMat = new THREE.MeshStandardMaterial({ map: rep(tex.concrete, L / 3.2, CH / 3.2), roughness: 1, color: 0x9a9f90 });
  const left = new THREE.Mesh(new THREE.PlaneGeometry(L, CH), wallMat);
  left.rotation.y = Math.PI / 2; left.position.set(-CW / 2, CH / 2, zc);
  const right = left.clone(); right.rotation.y = -Math.PI / 2; right.position.x = CW / 2;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CW, L), new THREE.MeshStandardMaterial({ map: rep(tex.concrete, CW / 3, L / 3), color: 0x4a4b44, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, CH, zc);
  const endFar = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  endFar.position.set(0, CH / 2, Z1);
  const endNear = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), wallMat);
  endNear.rotation.y = Math.PI; endNear.position.set(0, CH / 2, Z0);
  left.receiveShadow = right.receiveShadow = true;
  scene.add(floor, left, right, ceil, endFar, endNear);

  // rails the wall rides on
  const railMat = new THREE.MeshStandardMaterial({ map: rep(tex.rust, 1, L / 2), roughness: 0.6, metalness: 0.5, color: 0x8c7d6c });
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, L), railMat);
    r.position.set(s * 2.8, 0.035, zc); r.receiveShadow = true;
    scene.add(r);
  }

  // fluorescent fixtures + a few real lights
  const tubes = [];
  for (let z = 2; z > Z1 + 4; z -= 7) {
    const g = new THREE.Group();
    if (props.fixture) {
      const f = fitTo(props.fixture.clone(), 1.6);
      f.rotation.x = Math.PI; // tubes face down
      g.add(f);
    }
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xe9f2d8 });
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.08), tubeMat);
    tube.position.y = -0.08;
    g.add(tube);
    g.position.set(0, CH - 0.12, z);
    g.rotation.y = Math.PI / 2;
    scene.add(g);
    tubes.push({ mat: tubeMat, z });
  }
  const lights = [2, -5, -12, -19].map((z) => {
    const l = new THREE.PointLight(0xe3ecd0, 9, 13, 1.6);
    l.position.set(0, CH - 0.35, z);
    scene.add(l);
    return l;
  });
  lights[0].castShadow = true;
  lights[0].shadow.mapSize.set(512, 512);
  lights[0].shadow.bias = -0.002;

  // junk
  const put = (proto, size, x, y, z, ry, rz = 0) => {
    if (!proto) return null;
    const o = fitTo(proto.clone(), size);
    o.position.set(x, y, z); o.rotation.set(0, ry, rz);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(o);
    return o;
  };
  put(props.chair, 0.9, 2.45, 0, -1.6, -2.4);
  put(props.sneaker, 0.3, -1.6, 0, -6.5, 0.7);
  put(props.sneaker, 0.3, 1.2, 0, -11, 2.2);
  put(props.sneaker, 0.3, -0.6, 0, 1.8, -1.2);
  put(props.cctv, 0.55, -2.95, 3.4, -1.0, Math.PI / 2 + 0.5);
  put(props.cctv, 0.55, 2.95, 3.4, -9.0, -Math.PI / 2 - 0.4);

  // hand-painted scoreboard on the right wall
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const bt = new THREE.CanvasTexture(c); bt.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.94), new THREE.MeshStandardMaterial({ map: bt, roughness: 1 }));
  board.rotation.y = -Math.PI / 2; board.position.set(CW / 2 - 0.02, 2.5, -3.2);
  scene.add(board);
  const drawBoard = (score, best) => {
    const x = c.getContext('2d');
    x.fillStyle = '#d8d1bd'; x.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(60,50,30,${Math.random() * 0.15})`; x.fillRect(Math.random() * 256, Math.random() * 160, 3, 3); }
    x.strokeStyle = '#3a2d1e'; x.lineWidth = 6; x.strokeRect(6, 6, 244, 148);
    x.fillStyle = '#7a1410'; x.font = 'bold 26px "Black Han Sans", sans-serif'; x.fillText('생존 기록', 18, 40);
    x.fillStyle = '#211a12'; x.font = 'bold 72px "Black Han Sans", sans-serif'; x.fillText(String(score).padStart(3, '0'), 18, 118);
    x.font = 'bold 20px "Black Han Sans", sans-serif'; x.fillText(`최고 ${best}`, 160, 140);
    bt.needsUpdate = true;
  };
  drawBoard(0, 0);

  let timer = 2, flickering = false;
  return {
    drawBoard,
    update(dt, t) {
      // one tube occasionally stutters
      timer -= dt;
      if (timer < 0) { flickering = !flickering; timer = flickering ? 0.08 + Math.random() * 0.3 : 1.5 + Math.random() * 3.5; }
      const on = !flickering || Math.sin(t * 90) > 0;
      lights[1].intensity = on ? 9 : 1.5;
      tubes[1].mat.color.setHex(on ? 0xe9f2d8 : 0x3a3d35);
    },
  };
}
