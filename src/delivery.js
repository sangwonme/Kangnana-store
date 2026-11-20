// Delivery rider: scooter outside → glass door → pickup counter → takes the bags → leaves.
// anomaly = rider wearing a banana hat who stops and stares into the kitchen.
import * as THREE from 'three';
import { PICKUP } from './cooking.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const OUTSIDE = V(0.03, 0, 6.4);
const INSIDE = V(0.03, 0, 4.2);
const MID = V(0.05, 0, 2.6);
const COUNTER = V(0.7, 0, 0.85);
const STREET = V(0.5, 1, 8.5);

export class Delivery {
  constructor(g, rider, riderX) {
    this.g = g;
    this.rider = rider;
    this.riderX = riderX; // banana-helmet variant (placeholder if the GLB is missing)
    riderX.root.visible = false;
    g.scene.add(riderX.root);
    this.jobs = [];
    this.busy = false;
    rider.root.visible = false;
    g.scene.add(rider.root);
  }

  request(pack, anomaly = false) {
    this.jobs.push({ pack, anomaly });
    if (!this.busy) this.loop();
  }

  async loop() {
    this.busy = true;
    while (this.jobs.length) await this.trip(this.jobs.splice(0));
    this.busy = false;
  }

  async trip(batch) {
    const g = this.g, ev = g.events, s = g.sound;
    const anomaly = batch.some((j) => j.anomaly);
    const r = anomaly && !this.riderX.placeholder ? this.riderX : this.rider;
    await g.wait(anomaly ? 2.5 : 4);
    s.atPoint('scooter_arrive', STREET, 0.9, 3);
    await g.wait(3.2);

    this.rider.setHat(anomaly && r === this.rider); // fallback: normal rider + banana hat
    r.root.position.copy(OUTSIDE);
    r.faceTo(INSIDE);
    r.root.visible = true;
    s.atPoint('door_open', OUTSIDE.clone().setZ(5), 0.8, 2);
    s.atPoint('door_bell', V(0.35, 2.2, 4.94), 0.8, 2);
    ev.swingDoor(-1.35, 0.5);
    await g.wait(0.3);
    await r.walk([INSIDE], anomaly ? 1.0 : 1.5);
    ev.swingDoor(0, 0.5);
    s.atPoint('door_close', V(0.03, 1, 5), 0.6, 2);
    await r.walk([MID, COUNTER], anomaly ? 0.9 : 1.5);
    r.faceTo(V(-0.2, 0, -0.4)); // looks in through the pass window

    if (anomaly) {
      // stands at the pass window and stares into the kitchen
      r.play(r.has('look') ? 'look' : 'idle');
      s.loop('heartbeat_loop', 0);
      s.fadeLoop('heartbeat_loop', 0.45, 2);
      const noticed = await ev.waitSeen(r.root, { hold: 0.8, timeout: 10 });
      if (noticed) s.play('dread_hit', 0.5);
      r.play('idle');
      await g.wait(noticed ? 3.5 : 1);
      s.fadeLoop('heartbeat_loop', 0, 3);
    } else {
      await g.wait(0.9);
    }
    s.atPoint('plastic_bag', PICKUP, 0.8, 1.5);
    for (const j of batch) j.pack.removeFromParent();
    await g.wait(0.6);

    await r.walk([MID, INSIDE], 1.5);
    s.atPoint('door_open', V(0.03, 1, 5), 0.8, 2);
    s.atPoint('door_bell', V(0.35, 2.2, 4.94), 0.6, 2);
    ev.swingDoor(-1.35, 0.5);
    await g.wait(0.3);
    await r.walk([OUTSIDE], 1.5);
    r.root.visible = false;
    ev.swingDoor(0, 0.5);
    s.atPoint('door_close', V(0.03, 1, 5), 0.6, 2);
    await g.wait(1);
    s.atPoint('scooter_leave', STREET, 0.9, 3);
  }
}
