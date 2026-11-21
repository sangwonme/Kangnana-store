// The crusher wall: banana wallpaper with a silhouette hole (alphaMap from the mask), a glowing plate behind the hole,
// rusty posts with spikes, hazard stripes, beacons, and blood splats.
import * as THREE from 'three';
import { WIN, MW, MH } from './silhouette.js';

export const WALL_W = 5.2, WALL_H = 3.7;

function hazardTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#d9a91a'; x.fillRect(0, 0, 256, 32);
  x.fillStyle = '#1b1a17';
  for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 32, 32); x.lineTo(i * 32 + 16, 32); x.lineTo(i * 32 + 48, 0); x.lineTo(i * 32 + 32, 0); x.fill(); }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(40,25,10,${Math.random() * 0.25})`; x.fillRect(Math.random() * 256, Math.random() * 32, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function splatTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const blob = (cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  x.fillStyle = 'rgba(236,198,38,0.93)';   // banana juice
  blob(64, 64, 26);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 40;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + Math.random() * 9);
  }
  for (let i = 0; i < 6; i++) { const xx = 40 + Math.random() * 48; x.fillRect(xx, 64, 3 + Math.random() * 4, 30 + Math.random() * 34); } // drips
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Wall {
  constructor(tex, props) {
    this.group = new THREE.Group();
    this.data = new Uint8Array(MW * MH * 4).fill(255);
    const hole = new THREE.DataTexture(this.data, MW, MH, THREE.RGBAFormat);
    hole.magFilter = hole.minFilter = THREE.LinearFilter;
    hole.wrapS = hole.wrapT = THREE.ClampToEdgeWrapping;
    // map the mask window onto its world rectangle on the wall plane
    const u0 = (WIN.x0 + WALL_W / 2) / WALL_W, u1 = (WIN.x1 + WALL_W / 2) / WALL_W, v1 = (WIN.y1 - WIN.y0) / WALL_H;
    hole.repeat.set(1 / (u1 - u0), 1 / v1);
    hole.offset.set(-u0 / (u1 - u0), 0);
    hole.needsUpdate = true;
    this.hole = hole;

    const paper = tex.wallpaper.clone();
    paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
    paper.repeat.set(WALL_W / 1.5, WALL_H / 1.5);
    paper.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: paper, alphaMap: hole, alphaTest: 0.5, roughness: 0.95, color: 0xcfc2a6 });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), mat);
    front.position.y = WIN.y0 + WALL_H / 2;
    front.receiveShadow = true;
    const back = new THREE.Mesh(front.geometry, new THREE.MeshStandardMaterial({ color: 0x2a221a, alphaMap: hole, alphaTest: 0.5, roughness: 1 }));
    back.position.set(0, front.position.y, -0.28);
    this.group.add(front, back);
    this.front = front;

    // light seeping through the hole
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.95, fog: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0 + 0.4, WIN.y1 - WIN.y0 + 0.3), this.glowMat);
    glow.position.set(0, (WIN.y0 + WIN.y1) / 2, -0.55);
    this.group.add(glow);
    this.glow = glow;

    // frame
    const rust = tex.rust.clone(); rust.wrapS = rust.wrapT = THREE.RepeatWrapping; rust.repeat.set(1, 4); rust.needsUpdate = true;
    const metal = new THREE.MeshStandardMaterial({ map: rust, roughness: 0.8, metalness: 0.3, color: 0xb0a090 });
    const postGeo = new THREE.BoxGeometry(0.4, WALL_H + 0.3, 0.7);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, metal);
      post.position.set(s * (WALL_W / 2 + 0.2), WIN.y0 + (WALL_H + 0.3) / 2, -0.14);
      post.castShadow = true;
      this.group.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(WALL_W + 0.8, 0.35, 0.7), metal);
    beam.position.set(0, WIN.y0 + WALL_H + 0.15, -0.14);
    this.group.add(beam);
    const hz = hazardTexture(); hz.repeat.set(6, 1);
    const hazMat = new THREE.MeshStandardMaterial({ map: hz, roughness: 0.9 });
    for (const y of [WIN.y0 + 0.1, WIN.y0 + WALL_H + 0.15]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W + 0.8, 0.22), hazMat);
      strip.position.set(0, y, 0.22);
      this.group.add(strip);
    }
    // spikes on the posts, pointing at the player
    const spikeGeo = new THREE.ConeGeometry(0.06, 0.38, 6).rotateX(Math.PI / 2).translate(0, 0, 0.19);
    const spikes = new THREE.InstancedMesh(spikeGeo, new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.5, metalness: 0.7 }), 24);
    let k = 0;
    const m = new THREE.Matrix4();
    for (const s of [-1, 1]) for (let i = 0; i < 12; i++) {
      m.makeTranslation(s * (WALL_W / 2 + 0.2) + (i % 2 ? 0.08 : -0.08), WIN.y0 + 0.35 + i * 0.28, 0.21);
      spikes.setMatrixAt(k++, m);
    }
    this.group.add(spikes);
    // beacons
    this.beacons = [];
    if (props.beacon) {
      for (const s of [-1, 1]) {
        const b = props.beacon.clone();
        b.scale.setScalar(0.32 / 1.9);
        b.position.set(s * (WALL_W / 2 + 0.2), WIN.y0 + WALL_H + 0.32, -0.1);
        this.group.add(b);
      }
    }
    this.light = new THREE.PointLight(0xff2a1a, 0, 9, 2);
    this.light.position.set(0, WIN.y0 + WALL_H + 0.8, 0.8);
    this.group.add(this.light);

    this.splatTex = splatTexture();
    this.splats = [];
    this.group.visible = false;
  }

  setMask(hole) {
    for (let i = 0; i < hole.length; i++) {
      const v = hole[i] ? 0 : 255;
      this.data[i * 4] = this.data[i * 4 + 1] = this.data[i * 4 + 2] = v;
      this.data[i * 4 + 3] = 255;
    }
    this.hole.needsUpdate = true;
  }

  /** Blood on the wall face around world (x, y). */
  splat(x, y, size = 1) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: this.splatTex, transparent: true, depthWrite: false }));
    s.position.set(x, y, 0.03 + this.splats.length * 0.002);
    s.rotation.z = Math.random() * Math.PI * 2;
    this.group.add(s);
    this.splats.push(s);
  }

  clearSplats() {
    for (const s of this.splats) { this.group.remove(s); s.geometry.dispose(); s.material.dispose(); }
    this.splats = [];
  }
}
