/**
 * Enkel 2D-kollision i golvplanet (x/z). Väggar och möbler beskrivs som
 * axelparallella rektanglar eller cirklar. Spelaren är en cirkel.
 */
export class CollisionWorld {
  constructor() {
    this.rects = [];
    this.circles = [];
  }

  clear() {
    this.rects.length = 0;
    this.circles.length = 0;
  }

  addRect(minX, minZ, maxX, maxZ) {
    this.rects.push({ minX: Math.min(minX, maxX), minZ: Math.min(minZ, maxZ), maxX: Math.max(minX, maxX), maxZ: Math.max(minZ, maxZ) });
  }

  addCircle(x, z, r) {
    this.circles.push({ x, z, r });
  }

  /** Puttar ut en position (muteras) ur alla hinder. Returnerar true om något träffades. */
  resolve(pos, radius) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const r of this.rects) {
        const cx = Math.max(r.minX, Math.min(pos.x, r.maxX));
        const cz = Math.max(r.minZ, Math.min(pos.z, r.maxZ));
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (radius - d);
          pos.z += (dz / d) * (radius - d);
        } else {
          // Mittpunkten ligger inuti rektangeln: putta ut längs kortaste axeln.
          const left = pos.x - r.minX, right = r.maxX - pos.x;
          const back = pos.z - r.minZ, front = r.maxZ - pos.z;
          const m = Math.min(left, right, back, front);
          if (m === left) pos.x = r.minX - radius;
          else if (m === right) pos.x = r.maxX + radius;
          else if (m === back) pos.z = r.minZ - radius;
          else pos.z = r.maxZ + radius;
        }
        moved = hit = true;
      }
      for (const c of this.circles) {
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const min = radius + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-5;
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  isBlocked(x, z, radius) {
    for (const r of this.rects) {
      const cx = Math.max(r.minX, Math.min(x, r.maxX));
      const cz = Math.max(r.minZ, Math.min(z, r.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true;
    }
    for (const c of this.circles) {
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (radius + c.r) ** 2) return true;
    }
    return false;
  }
}
