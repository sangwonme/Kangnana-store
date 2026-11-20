// Look-at interaction: invisible proxy boxes, center-screen raycast (occluded by the world), "E <label>" prompt.
import * as THREE from 'three';

const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

export class Interact {
  constructor(scene, worldRoot) {
    this.scene = scene;
    this.worldRoot = worldRoot;
    this.entries = new Set();
    this.target = null;
    this.enabled = true;
    this.ray = new THREE.Raycaster();
    this.ray.far = 4;
    this.acc = 0;
    this.prompt = document.getElementById('prompt');
  }

  /** at: [x,y,z]; size: [sx,sy,sz]; label(): string|null (null = not usable now); use(): void */
  add({ at, size = [0.2, 0.2, 0.2], range = 1.7, label, use }) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), proxyMat);
    mesh.position.fromArray(at);
    const entry = { mesh, range, label, use };
    mesh.userData.entry = entry;
    this.scene.add(mesh);
    this.entries.add(entry);
    return entry;
  }

  remove(entry) {
    this.entries.delete(entry);
    entry.mesh.removeFromParent();
    if (this.target === entry) this.target = null;
  }

  update(dt, camera) {
    this.acc += dt;
    if (this.acc < 0.08) return;
    this.acc = 0;
    if (!this.enabled) {
      this.target = null;
      this.prompt.hidden = true;
      return;
    }
    this.ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const proxies = [...this.entries].map((e) => e.mesh);
    const hits = this.ray.intersectObjects([...proxies, this.worldRoot], true);
    const first = hits.find((h) => h.object.userData.entry || (h.object.visible && h.object.parent?.visible !== false));
    const e = first?.object.userData.entry;
    const label = e && first.distance <= e.range ? e.label() : null;
    this.target = label ? e : null;
    this.prompt.hidden = !label;
    if (label) this.prompt.innerHTML = `<b>E</b> ${label}`;
  }

  use() {
    if (!this.target) return false;
    this.target.use();
    this.acc = 1; // refresh prompt next frame
    return true;
  }
}
