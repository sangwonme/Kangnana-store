// Title screen: a single banana lying on night asphalt under a street light, slow orbiting camera.
import * as THREE from 'three';
import { ps1Material } from '../../shared/lib/ps1.js';

function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#2b2b2d';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 25 + Math.random() * 45;
    x.fillStyle = `rgb(${v},${v},${v + 2})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // a crack and an oil stain
  x.strokeStyle = '#151516';
  x.lineWidth = 1.5;
  x.beginPath();
  x.moveTo(20, 200);
  for (let i = 0; i < 8; i++) x.lineTo(20 + i * 30 + Math.random() * 10, 200 - i * 8 + Math.random() * 14);
  x.stroke();
  x.fillStyle = 'rgba(10,10,14,0.35)';
  x.beginPath();
  x.ellipse(170, 90, 40, 22, 0.4, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function banana() {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.13, 0.05, 0), new THREE.Vector3(-0.07, 0.03, 0.035), new THREE.Vector3(0, 0.028, 0.045),
    new THREE.Vector3(0.07, 0.03, 0.035), new THREE.Vector3(0.12, 0.045, 0.005),
  ]);
  const geo = new THREE.TubeGeometry(curve, 20, 0.028, 6, false);
  // taper both ends
  const pos = geo.attributes.position, uv = geo.attributes.uv, p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), center = curve.getPoint(u);
    const k = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
    p.fromBufferAttribute(pos, i).sub(center).multiplyScalar(k).add(center);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, ps1Material({ color: 0xf2cf2a })));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.01, 0.045, 5), ps1Material({ color: 0x5a4320 }));
  stem.position.copy(curve.getPoint(0)).add(new THREE.Vector3(-0.015, 0.01, 0));
  stem.rotation.z = 1.2;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.01, 5, 4), ps1Material({ color: 0x2a2014 }));
  tip.position.copy(curve.getPoint(1));
  // a few brown ripeness spots
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.006, 4, 3), ps1Material({ color: 0x4a3418 }));
    s.position.copy(curve.getPoint(0.2 + i * 0.14)).add(new THREE.Vector3(0, 0.018, 0.012));
    g.add(s);
  }
  g.add(stem, tip);
  return g;
}

export class TitleScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020203);
    this.scene.fog = new THREE.Fog(0x020203, 1.2, 4.5);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.02, 30);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12, 8, 8), ps1Material({ map: asphaltTexture() }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    // faded road line
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 6), ps1Material({ color: 0x8a7a3a }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(-0.55, 0.002, 0);
    this.scene.add(line);

    this.banana = banana();
    this.banana.rotation.y = 0.5;
    this.scene.add(this.banana);

    const lamp = new THREE.SpotLight(0xffd9a0, 14, 8, 0.42, 0.6, 1.4);
    lamp.position.set(0.35, 3.2, 0.2);
    lamp.target = this.banana;
    this.lamp = lamp;
    this.scene.add(lamp, new THREE.HemisphereLight(0x303848, 0x000000, 0.12));
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(t) {
    const a = t * 0.12;
    this.camera.position.set(Math.sin(a) * 0.75, 0.32 + Math.sin(t * 0.3) * 0.03, Math.cos(a) * 0.75);
    this.camera.lookAt(0, 0.02, 0);
    // the street light buzzes and stutters now and then
    const n = Math.sin(t * 1.7) * Math.sin(t * 5.3);
    this.lamp.intensity = n > 0.9 ? 3 : 14;
  }
}
