// Laddar ner MediaPipe Pose Landmarker-modellen till public/models/ så att
// provningen kan köras helt utan externa anrop (även modellen serveras lokalt).
//   npm run fetch-model
import fs from 'node:fs';
import path from 'node:path';

const URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const out = path.resolve('public/models/pose_landmarker_lite.task');
fs.mkdirSync(path.dirname(out), { recursive: true });
const optional = process.argv.includes('--optional');
if (fs.existsSync(out) && fs.statSync(out).size > 1e6) {
  console.log(`Modellen finns redan: ${out}`);
  process.exit(0);
}
try {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Nedladdning misslyckades: ${res.status}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`Sparade ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
} catch (e) {
  // Vid --optional (används av `npm run build`) faller appen tillbaka på Googles CDN.
  console.warn(`Kunde inte hämta modellen: ${e.message}`);
  if (!optional) process.exit(1);
}
