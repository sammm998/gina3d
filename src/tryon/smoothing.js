/**
 * One Euro-filter (Casiez m.fl. 2012): jämnar ut darr vid stillhet men
 * reagerar snabbt vid stora rörelser. Används för att plagget inte ska hacka.
 */
export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.5, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value, tSeconds) {
    if (this.x === null) {
      this.x = value;
      this.t = tSeconds;
      return value;
    }
    const dt = Math.max(1e-3, tSeconds - this.t);
    this.t = tSeconds;
    const dx = (value - this.x) / dt;
    const ad = OneEuroFilter.alpha(this.dCutoff, dt);
    this.dx = ad * dx + (1 - ad) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = OneEuroFilter.alpha(cutoff, dt);
    this.x = a * value + (1 - a) * this.x;
    return this.x;
  }
}

/** Filtrerar ett objekt med flera numeriska fält. */
export class MultiFilter {
  constructor(keys, opts) {
    this.filters = Object.fromEntries(keys.map((k) => [k, new OneEuroFilter(opts)]));
  }
  reset() {
    Object.values(this.filters).forEach((f) => f.reset());
  }
  filter(obj, t) {
    const out = {};
    for (const k in this.filters) out[k] = this.filters[k].filter(obj[k], t);
    return out;
  }
}
