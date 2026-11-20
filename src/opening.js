// Opening cutscene: Dongwoo greets the new part-timer, makes excuses, and hurries out the front door.
import * as THREE from 'three';

const LINES = [
  { id: 'dongwoo_01', text: '어, 왔어?', anim: 'wave' },
  { id: 'dongwoo_02', text: '주문만 잘 쳐내면 돼.', anim: 'talk' },
  { id: 'dongwoo_03', text: '난 어디 급한 일이 있어서...', anim: 'talk', glanceAway: true },
];

export class Opening {
  constructor(game) {
    this.g = game;
    this.timers = [];
    this.tracking = false;
    this.done = false;
  }

  wait(s) { return new Promise((r) => this.timers.push({ t: s, r })); }

  bubble(text) {
    const el = document.getElementById('bubble');
    el.hidden = !text;
    if (text) document.getElementById('bubble-text').textContent = text;
  }

  hint(text) {
    const el = document.getElementById('hint');
    el.textContent = text || '';
  }

  async swingDoor(to, seconds) {
    const door = this.g.world.door;
    if (!door) return;
    const from = door.rotation.y;
    for (let t = 0; t < seconds; t += 1 / 60) {
      door.rotation.y = THREE.MathUtils.lerp(from, to, THREE.MathUtils.smoothstep(t / seconds, 0, 1));
      await this.wait(1 / 60);
    }
    door.rotation.y = to;
  }

  async run() {
    const { player, dongwoo: d, world, sound } = this.g;
    player.canMove = false;
    this.hint('마우스로 둘러보기');
    d.faceTo(player.pos);
    d.play('idle', { fade: 0 });
    this.tracking = true;

    await this.wait(1.6);
    for (const line of LINES) {
      if (line.glanceAway) {
        // looks toward the exit, evasive
        this.faceTarget = world.pos('dongwoo_path_1');
        await this.wait(0.5);
      } else {
        this.faceTarget = player.pos;
      }
      d.play(d.has(line.anim) ? line.anim : 'idle', { once: line.anim === 'wave', then: d.has('talk') ? 'talk' : 'idle' });
      sound.at(line.id, d.mouth, 1.0, 1.5);
      this.bubble(line.text);
      await this.wait(sound.duration(line.id) + 0.45);
    }
    d.play('idle');
    await this.wait(0.35);
    this.bubble(null);
    this.faceTarget = null;

    // hurry out
    const path = Object.keys(world.anchors)
      .filter((n) => /^dongwoo_path_\d+$/.test(n))
      .sort((a, b) => +a.split('_').pop() - +b.split('_').pop())
      .map((n) => world.pos(n));
    d.onStep = () => sound.at(`footstep_tile_${1 + Math.floor(Math.random() * 4)}`, d.root, 0.6, 1.2, 0.95 + Math.random() * 0.1);

    const doorPos = world.door ? world.door.getWorldPosition(new THREE.Vector3()) : path.at(-1);
    const walking = d.walk(path, 1.6);
    // open the door once he gets close to it
    (async () => {
      while (d.root.position.distanceTo(doorPos) > 1.6 && d.path) await this.wait(0.05);
      sound.atPoint('door_open', doorPos, 0.9, 2);
      sound.atPoint('door_bell', doorPos.clone().setY(2.2), 0.9, 2);
      await this.swingDoor(-1.35, 0.6); // leaf extends +X from the hinge; negative Y swings it outward (+Z)
    })();
    await walking;
    this.tracking = false;
    d.root.visible = false;
    await this.wait(0.9);
    sound.atPoint('door_close', doorPos, 0.8, 2);
    await this.swingDoor(0, 0.5);
    sound.atPoint('door_bell', doorPos.clone().setY(2.2), 0.35, 2);
    sound.fadeLoop('amb_street_night', 0.05, 2);

    await this.wait(1.5);
    player.canMove = true;
    this.hint('WASD 이동');
    this.g.startShift();
    await this.wait(6);
    if (document.getElementById('hint').textContent === 'WASD 이동') this.hint('');
    this.done = true;
  }

  update(dt) {
    for (const t of this.timers.slice()) {
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(this.timers.indexOf(t), 1);
        t.r();
      }
    }
    const { player, dongwoo: d } = this.g;
    if (this.faceTarget) d.faceTo(this.faceTarget, dt, 5);
    // gently keep 동우 in view unless the player is actively looking around
    if (this.tracking && performance.now() - player.lastLook > 1500) {
      player.lookToward(d.mouth.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.05, 0)), dt, 1.6);
    }
  }
}
