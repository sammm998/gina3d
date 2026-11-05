/**
 * A*-vägsökning på ett rutnät som byggs från kollisionsvärlden.
 * Används för klick-för-att-gå, snabbhopp till zoner och den guidade turen.
 */
export class NavGrid {
  constructor(world, bounds, cell = 0.2, radius = 0.32) {
    this.cell = cell;
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const { x, z } = this.center(c, r);
        this.blocked[r * this.cols + c] = world.isBlocked(x, z, radius) ? 1 : 0;
      }
    }
  }

  center(c, r) {
    return { x: this.minX + (c + 0.5) * this.cell, z: this.minZ + (r + 0.5) * this.cell };
  }

  toCell(x, z) {
    return {
      c: Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cell))),
      r: Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.cell))),
    };
  }

  free(c, r) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && !this.blocked[r * this.cols + c];
  }

  /** Närmaste fria cell (spiralsökning). */
  nearestFree(c, r, maxRing = 40) {
    if (this.free(c, r)) return { c, r };
    for (let ring = 1; ring <= maxRing; ring++) {
      let best = null;
      let bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          if (this.free(c + dc, r + dr)) {
            const d = dc * dc + dr * dr;
            if (d < bestD) { bestD = d; best = { c: c + dc, r: r + dr }; }
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  lineFree(a, b) {
    // Bresenham över cellerna mellan a och b, med lite marginal.
    let x0 = a.c, y0 = a.r;
    const x1 = b.c, y1 = b.r;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      if (!this.free(x0, y0)) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
      // Diagonala steg får inte skära hörn.
      if (e2 > -dy && e2 < dx && (!this.free(x0 - sx, y0) || !this.free(x0, y0 - sy))) return false;
    }
  }

  /** Returnerar en lista av {x, z}-punkter, eller null om ingen väg finns. */
  findPath(from, to) {
    const s = this.nearestFree(...Object.values(this.toCell(from.x, from.z)));
    const g = this.nearestFree(...Object.values(this.toCell(to.x, to.z)));
    if (!s || !g) return null;
    const N = this.cols * this.rows;
    const idx = (c, r) => r * this.cols + c;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const start = idx(s.c, s.r);
    const goal = idx(g.c, g.r);
    const h = (c, r) => {
      const dx = Math.abs(c - g.c), dy = Math.abs(r - g.r);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    gScore[start] = 0;
    heap.push(start, h(s.c, s.r));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const c = cur % this.cols, r = (cur / this.cols) | 0;
      for (const [dc, dr, cost] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (!this.free(nc, nr)) continue;
        if (dc && dr && (!this.free(c + dc, r) || !this.free(c, r + dr))) continue;
        const ni = idx(nc, nr);
        const ng = gScore[cur] + cost;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(nc, nr));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let cur = goal; cur !== -1; cur = came[cur]) cells.push({ c: cur % this.cols, r: (cur / this.cols) | 0 });
    cells.reverse();
    // Strängdragning: hoppa över punkter med fri sikt.
    const out = [];
    let anchor = 0;
    for (let i = 1; i < cells.length; i++) {
      if (!this.lineFree(cells[anchor], cells[i])) {
        out.push(cells[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(cells[cells.length - 1]);
    const pts = out.map((cell) => this.center(cell.c, cell.r));
    // Sista punkten: använd exakt mål om det är fritt.
    if (this.free(...Object.values(this.toCell(to.x, to.z)))) pts[pts.length - 1] = { x: to.x, z: to.z };
    return pts;
  }
}

class MinHeap {
  constructor() { this.items = []; this.prios = []; }
  get size() { return this.items.length; }
  push(item, prio) {
    const a = this.items, p = this.prios;
    a.push(item); p.push(prio);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (p[parent] <= p[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [p[i], p[parent]] = [p[parent], p[i]];
      i = parent;
    }
  }
  pop() {
    const a = this.items, p = this.prios;
    const top = a[0];
    const lastI = a.pop(), lastP = p.pop();
    if (a.length) {
      a[0] = lastI; p[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && p[l] < p[m]) m = l;
        if (r < a.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [p[i], p[m]] = [p[m], p[i]];
        i = m;
      }
    }
    return top;
  }
}
