import * as THREE from 'three';

/**
 * "Uppblåst" 3D-plagg ur en frilagd produktbild (transparent PNG).
 *
 * Plaggets siluett (alfakanalen) rastreras till ett rutnät. Ett avståndsfält
 * från kanten ger tjockleken: mitten av plagget buktar ut, kanterna går ner
 * till noll – ungefär som ett riktigt plagg som hänger eller sitter på en kropp.
 * Fram- och baksida byggs separat och möts i kanten. Bilden ligger som textur
 * på båda sidor (alphaTest ger en skarp kontur).
 *
 * Geometrin är normaliserad: höjd 1 (y = 0.5 … −0.5), bredd = bildens
 * proportion, maximal utbuktning 1 i z. Skala z per användning.
 *
 * Material: grupp 0 = framsida, grupp 1 = baksida.
 */
const cache = new Map();

export function inflatedGeometry(image, { cols = 48, back = 0.85 } = {}) {
  const key = `${image.src || image.currentSrc}:${cols}:${back}`;
  if (cache.has(key)) return cache.get(key);

  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const aspect = iw / ih;
  const C = cols;
  const R = Math.max(8, Math.round(cols / aspect));
  const canvas = document.createElement('canvas');
  canvas.width = C;
  canvas.height = R;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, C, R);
  const px = g.getImageData(0, 0, C, R).data;

  // 1) mask per cell
  const inside = new Uint8Array(C * R);
  for (let i = 0; i < C * R; i++) inside[i] = px[i * 4 + 3] > 90 ? 1 : 0;

  // Underkänn bilder där bakgrunden inte är bortplockad (nästan hel rektangel
  // eller motiv som går ut i flera kanter) – de blir annars en spöklik skiva
  // med en mörk kontaktskugga under.
  {
    let n = 0, x0 = C, y0 = R, x1 = -1, y1 = -1;
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) if (inside[y * C + x]) {
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const fill = n / Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
    const edges = (x0 === 0) + (y0 === 0) + (x1 === C - 1) + (y1 === R - 1);
    if (n < C * R * 0.04 || fill > 0.9 || edges >= 3) {
      cache.set(key, null);
      return null;
    }
  }

  // 2) avståndsfält (chamfer 3-4) inne i masken
  const INF = 1e9;
  const d = new Float32Array(C * R);
  for (let i = 0; i < C * R; i++) d[i] = inside[i] ? INF : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= C || y >= R ? 0 : d[y * C + x]);
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < C; x++) {
      const i = y * C + x;
      if (!inside[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  }
  let maxD = 1;
  for (let y = R - 1; y >= 0; y--) {
    for (let x = C - 1; x >= 0; x--) {
      const i = y * C + x;
      if (!inside[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
      if (d[i] > maxD) maxD = d[i];
    }
  }
  // rundad profil, lite platt i mitten (som tyg över en kropp)
  const cellH = (i) => (inside[i] ? Math.sqrt(Math.min(1, d[i] / (maxD * 0.55))) : 0);

  // 3) höjd i rutnätets hörn = medel av omgivande celler; 0 om någon granne är utanför
  const VW = C + 1, VH = R + 1;
  const vh = new Float32Array(VW * VH);
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      let sum = 0, n = 0, out = false;
      for (const [cx, cy] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
        if (cx < 0 || cy < 0 || cx >= C || cy >= R || !inside[cy * C + cx]) { out = true; continue; }
        sum += cellH(cy * C + cx);
        n++;
      }
      vh[y * VW + x] = out ? 0 : sum / Math.max(1, n);
    }
  }

  // 4) bygg fram- och baksida
  const pos = [], uv = [], idxF = [], idxB = [];
  const mapF = new Int32Array(VW * VH).fill(-1);
  const mapB = new Int32Array(VW * VH).fill(-1);
  const vert = (x, y, side) => {
    const k = y * VW + x;
    const m = side ? mapB : mapF;
    if (m[k] !== -1) return m[k];
    const h = vh[k];
    pos.push((x / C - 0.5) * aspect, 0.5 - y / R, side ? -h * back : h);
    uv.push(x / C, 1 - y / R);
    m[k] = pos.length / 3 - 1;
    return m[k];
  };
  // rita även en cell utanför siluetten (platt kant) – konturen klipps av bildens alfa
  const draw = new Uint8Array(C * R);
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < C; x++) {
      let any = 0;
      for (let dy = -1; dy <= 1 && !any; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < C && yy < R && inside[yy * C + xx]) { any = 1; break; }
      }
      draw[y * C + x] = any;
    }
  }
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < C; x++) {
      if (!draw[y * C + x]) continue;
      const a = vert(x, y, 0), b = vert(x + 1, y, 0), c = vert(x, y + 1, 0), e = vert(x + 1, y + 1, 0);
      idxF.push(a, c, b, b, c, e);
      const a2 = vert(x, y, 1), b2 = vert(x + 1, y, 1), c2 = vert(x, y + 1, 1), e2 = vert(x + 1, y + 1, 1);
      idxB.push(a2, b2, c2, b2, e2, c2);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex([...idxF, ...idxB]);
  geom.addGroup(0, idxF.length, 0);
  geom.addGroup(idxF.length, idxB.length, 1);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  geom.userData.aspect = aspect;
  cache.set(key, geom);
  return geom;
}

/** Material för uppblåsta plagg: framsida med foto, baksida något mörkare. */
export function inflatedMaterials(texture, { roughness = 0.88 } = {}) {
  const front = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness, side: THREE.FrontSide });
  const back = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: roughness + 0.04, color: '#cfcfcf', side: THREE.FrontSide });
  return [front, back];
}
