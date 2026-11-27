// Which microgame comes next.
//  - every BOSS_EVERY-th game is a random boss (never the same boss twice in a row when there is a choice)
//  - every other game is a random normal game that did not appear in the last GAP games
//  - if the pool is too small for that rule, the least recently played normal game is used
export const BOSS_EVERY = 10;
export const GAP = 10;

export class Scheduler {
  constructor(normals, bosses, rand = Math.random) {
    this.normals = normals;
    this.bosses = bosses;
    this.rand = rand;
    this.history = [];
  }

  pick(list) { return list[Math.floor(this.rand() * list.length)]; }

  /** n = 1-based index of the game about to be played. */
  next(n) {
    let id;
    if (n % BOSS_EVERY === 0 && this.bosses.length) {
      const lastBoss = [...this.history].reverse().find((h) => this.bosses.includes(h));
      const pool = this.bosses.length > 1 ? this.bosses.filter((b) => b !== lastBoss) : this.bosses;
      id = this.pick(pool);
    } else {
      const recent = new Set(this.history.slice(-GAP));
      const pool = this.normals.filter((g) => !recent.has(g));
      if (pool.length) id = this.pick(pool);
      else {
        // least recently used
        const lastSeen = (g) => this.history.lastIndexOf(g);
        id = [...this.normals].sort((a, b) => lastSeen(a) - lastSeen(b))[0];
      }
    }
    this.history.push(id);
    return id;
  }
}
