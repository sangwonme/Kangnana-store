// Between-game "banana world": Gangnana dances on a little banana island while the intermission groove plays;
// after a failure he kneels in despair (orz) under a rain cloud. Rendered on the shared WebGL canvas behind the
// intermission overlay. Built once, reused every intermission.
import * as THREE from 'three';
import { A, fitHeight } from './assets.js';

const SKY = { dance: ['#7fd6ff', '#ffe9a8'], sad: ['#5d6b7d', '#9aa3ad'] };

export class BananaWorld {
  constructor(renderer, rect) {
    this.renderer = renderer;
    this.rect = rect;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 0.75, 0.1, 200);
    this.camera.position.set(0, 2.6, 8.0);
    this.camera.lookAt(0, 1.6, 0);
    this.clock = new THREE.Clock();
    this.mixers = [];
    this.running = false;
    this.mood = 'idle';
    this.beat = 130 / 60;
    this.ready = this.build();
  }

  skyTexture(top, bottom) {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    x.fillStyle = g;
    x.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  async build() {
    const s = this.scene;
    this.skies = { dance: this.skyTexture(...SKY.dance), sad: this.skyTexture(...SKY.sad) };
    s.background = this.skies.dance;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#e0b860', 2.0);
    this.sun = new THREE.DirectionalLight('#fff3d0', 2.2);
    this.sun.position.set(4, 8, 6);
    s.add(this.hemi, this.sun);

    // ground: a round yellow-green island with a sand rim
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 0.6, 48), new THREE.MeshLambertMaterial({ color: '#8fd16a' }));
    ground.position.y = -0.3;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(5.7, 6.0, 0.5, 48), new THREE.MeshLambertMaterial({ color: '#f5d98a' }));
    rim.position.y = -0.45;
    const sea = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshLambertMaterial({ color: '#3cc0e0' }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.6;
    s.add(ground, rim, sea);

    const [banana, tree, cute, cloud] = await Promise.all(['banana', 'btree', 'gangnana_cute', 'cloud'].map((n) => A.instance(n)));

    // palm trees and giant bananas around the stage
    for (const [x, z, h, r] of [[-3.9, -3.2, 4.2, 0.3], [4.0, -3.4, 4.5, -0.4], [-5.2, -6.0, 3.6, 0.2], [5.4, -5.8, 3.8, 0]]) {
      const t = (await A.instance('btree')).root;
      fitHeight(t, h);
      t.position.set(x, 0, z);
      t.rotation.y = r;
      s.add(t);
    }
    void tree;
    this.bananas = [];
    void banana;
    this.floaters = [];
    // lives: four bananas lined up in front of the island; a lost life leaves only its peel
    this.lives = [];
    for (let i = 0; i < 4; i++) {
      const ban = (await A.instance('banana')).root;
      fitHeight(ban, 0.75);
      const peel = (await A.instance('peel')).root;
      fitHeight(peel, 0.32);
      peel.visible = false;
      const g = new THREE.Group();
      g.add(ban, peel);
      g.position.set(-1.29 + i * 0.86, 0, 2.3);
      g.rotation.y = -0.5 + i * 0.3;
      s.add(g);
      this.lives.push({ g, ban, peel, alive: true, fall: 1 });
    }

    // ONE Gangnana (cute model) for every mood: idle / happy (dance) / sad (sinks to his knees and slumps)
    this.nana = new THREE.Group();     // position/tilt (procedural)
    this.turn = new THREE.Group();     // facing
    fitHeight(cute.root, 2.3);
    this.nana.add(cute.root);
    this.turn.add(this.nana);
    s.add(this.turn);
    this.anim = new THREE.AnimationMixer(cute.root);
    this.mixers.push(this.anim);
    const clip = (n) => cute.clips[n] || cute.animations[0];
    this.actions = { idle: this.anim.clipAction(clip('idle')), happy: this.anim.clipAction(clip('cheer')), sad: this.anim.clipAction(clip('idle')) };
    this.actions.idle.play();
    this.cur = this.actions.idle;

    // rain cloud for the sad mood
    this.cloud = new THREE.Group();
    fitHeight(cloud.root, 0.9);
    cloud.root.traverse((o) => { if (o.isMesh) o.material.color?.set('#7b8794'); });
    this.cloud.add(cloud.root);
    this.cloud.position.set(0.1, 2.55, -0.3);
    this.cloud.scale.setScalar(1.6);
    s.add(this.cloud);
    const dropGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.28, 4);
    const dropMat = new THREE.MeshBasicMaterial({ color: '#cfe8ff' });
    this.drops = Array.from({ length: 26 }, () => {
      const d = new THREE.Mesh(dropGeo, dropMat);
      d.position.set((Math.random() - 0.5) * 1.6, Math.random() * 2.6, (Math.random() - 0.5) * 0.8);
      this.cloud.add(d);
      return d;
    });
    this.setMood(this.mood);
    if (this.livesState) this.setLives(this.livesState.alive, this.livesState.dying);
  }

  /** alive = remaining lives (0..4); dying = index of the life lost just now (it tips over), -1 for none. */
  setLives(alive, dying = -1) {
    this.livesState = { alive, dying };
    if (!this.lives) return;
    this.lives.forEach((L, i) => {
      L.alive = i < alive;
      L.fall = !L.alive && i !== dying ? 1 : 0; // the newly lost one pops into a peel in the loop
      L.ban.visible = L.alive || L.fall < 1;
      L.peel.visible = !L.alive && L.fall >= 1;
      L.ban.scale.setScalar(L.baseScale ??= L.ban.scale.x);
    });
  }

  /** mood: 'idle' | 'happy' | 'sad' ('dance' is an alias of 'happy'). */
  setMood(mood) {
    if (mood === 'dance') mood = 'happy';
    const changed = mood !== this.mood;
    this.mood = mood;
    if (!this.nana) return;
    const sad = mood === 'sad';
    this.cloud.visible = sad;
    this.scene.background = this.skies[sad ? 'sad' : 'dance'];
    this.hemi.intensity = sad ? 1.2 : 2.0;
    this.sun.intensity = sad ? 0.8 : 2.2;
    const next = this.actions[mood];
    if (next !== this.cur) {
      next.reset().play();
      this.cur.crossFadeTo(next, 0.25, false);
      this.cur = next;
    }
    if (changed) this.moodT = 0;
  }

  /** Start rendering in a mood ('idle' | 'happy' | 'sad'); bpmRate scales the dance to the groove. */
  start(mood, bpmRate = 1) {
    this.beat = (130 / 60) * bpmRate;
    this.setMood(mood);
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      const dt = Math.min(0.05, this.clock.getDelta());
      const t = this.clock.elapsedTime;
      for (const m of this.mixers) m.update(dt * (this.mood === 'happy' ? this.beat / 2.2 : 1));
      if (this.nana) {
        this.moodT = (this.moodT || 0) + dt;
        const k = Math.min(1, this.moodT * 2.5); // ease into the new pose
        const ph = t * this.beat * Math.PI;
        const n = this.nana;
        let y = 0, rx = 0, ry = 0, rz = 0, turn = 0;
        if (this.mood === 'happy') {          // dance: bounce every beat, sway every bar
          y = Math.abs(Math.sin(ph)) * 0.35; ry = Math.sin(ph / 2) * 0.35; rz = Math.sin(ph) * 0.12;
        } else if (this.mood === 'sad') {     // sink to his knees in the grass, slump forward, sob (3/4 view)
          y = -0.32 - Math.abs(Math.sin(t * 2.2)) * 0.04; rx = 0.38; turn = 0.9;
        } else {                              // idle: easy breathing bob on the beat
          y = Math.abs(Math.sin(ph / 2)) * 0.06; rz = Math.sin(ph / 2) * 0.04;
        }
        const L = (a, b2) => a + (b2 - a) * k;
        n.position.y = L(n.position.y, y);
        n.rotation.x = L(n.rotation.x, rx);
        n.rotation.y = this.mood === 'happy' ? ry : L(n.rotation.y, ry);
        n.rotation.z = L(n.rotation.z, rz);
        this.turn.rotation.y = L(this.turn.rotation.y, turn);
        const bob = this.mood === 'sad' ? 0 : this.mood === 'happy' ? 0.18 : 0.06;
        for (const b of this.bananas) {
          b.g.position.y = Math.abs(Math.sin(ph + b.phase)) * bob;
          b.g.rotation.z = Math.sin(ph + b.phase) * bob;
        }
        for (const f of this.floaters) {
          f.g.position.y += Math.sin(t * 1.3 + f.phase) * 0.004;
          f.g.rotation.z = Math.sin(t + f.phase) * 0.4;
          f.g.rotation.y += dt * 0.8;
        }
        if (this.lives) {
          this.lives.forEach((L, i) => {
            if (L.alive) {
              L.g.position.y = Math.abs(Math.sin(ph / 2 + i)) * (this.mood === 'happy' ? 0.18 : 0.05);
              L.g.rotation.z = Math.sin(ph / 2 + i) * 0.12;
              return;
            }
            if (L.fall < 1) {
              L.fall = Math.min(1, L.fall + dt * 1.6);
              const f = L.fall;
              L.g.position.y = Math.sin(f * Math.PI) * 0.6;
              L.g.rotation.z = f * 6.0;
              L.ban.scale.setScalar(L.baseScale * (1 - f * 0.9));
              if (L.fall >= 1) { L.ban.visible = false; L.peel.visible = true; L.g.position.y = 0; L.g.rotation.z = 0; }
            }
          });
        }
        if (this.cloud.visible) for (const d of this.drops) { d.position.y -= dt * 5; if (d.position.y < -2.6) d.position.y = 0; }
      }
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }
}
