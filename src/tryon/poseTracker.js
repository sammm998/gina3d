/**
 * Kroppsposition med MediaPipe Pose Landmarker (@mediapipe/tasks-vision).
 * Allt körs lokalt i webbläsaren (WebAssembly/WebGL). WASM-filerna serveras
 * från /mediapipe/wasm (kopieras från node_modules av vite.config.js) och
 * modellen från /models – med Googles CDN som reserv för modellfilen.
 * Inga bilder eller videobilder lämnar enheten.
 */
const LOCAL_MODEL = '/models/pose_landmarker_lite.task';
const REMOTE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const WASM_PATH = '/mediapipe/wasm';

/** Landmärkesindex enligt MediaPipe Pose. */
export const LM = {
  leftShoulder: 11, rightShoulder: 12,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
};

let landmarkerPromise = null;
let currentMode = null;

async function modelUrl() {
  try {
    const r = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    const type = r.headers.get('content-type') || '';
    if (r.ok && !type.includes('text/html')) return LOCAL_MODEL;
  } catch {
    /* ingen lokal modell */
  }
  return REMOTE_MODEL;
}

export function loadPoseLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      const modelAssetPath = await modelUrl();
      const make = (delegate) =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      let lm;
      try {
        lm = await make('GPU');
      } catch {
        lm = await make('CPU');
      }
      currentMode = 'VIDEO';
      return lm;
    })();
    landmarkerPromise.catch(() => (landmarkerPromise = null));
  }
  return landmarkerPromise;
}

async function ensureMode(lm, mode) {
  if (currentMode !== mode) {
    await lm.setOptions({ runningMode: mode });
    currentMode = mode;
  }
}

/** Returnerar landmärken [{x, y, z, visibility}] (normaliserade 0–1) eller null. */
export async function detectVideo(video, timestampMs) {
  const lm = await loadPoseLandmarker();
  await ensureMode(lm, 'VIDEO');
  const res = lm.detectForVideo(video, timestampMs);
  return res.landmarks?.[0] ?? null;
}

export async function detectImage(image) {
  const lm = await loadPoseLandmarker();
  await ensureMode(lm, 'IMAGE');
  const res = lm.detect(image);
  return res.landmarks?.[0] ?? null;
}
