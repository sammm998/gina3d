import { detectImage } from '../poseTracker.js';
import { bodyFrame, drawPrepared } from '../overlay.js';
import { prepareGarment } from '../garmentPrep.js';
import { tryOnType } from '../../data/productMeta.js';

/**
 * Inbyggd provning: 2D-överlagring i webbläsaren med MediaPipe Pose.
 * Realtidsläget (webbkamera) körs direkt i TryOn.jsx med samma funktioner;
 * `render` används för stillbilder och som referens för gränssnittet.
 */
export const localOverlayProvider = {
  id: 'local-2d',
  name: '2D-överlagring (lokal)',
  realtime: true,
  sendsImagesToServer: false,
  description:
    'Plaggbilden skalas, roteras och placeras efter axlar, höfter och knän. Det är en förenklad 2D-överlagring – ingen fysisk tygsimulering.',
  async render({ person, product, garmentImage, adjust }) {
    const W = person.width || person.naturalWidth;
    const H = person.height || person.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(person, 0, 0, W, H);
    const lms = await detectImage(canvas);
    const type = tryOnType(product);
    const frame = bodyFrame(lms, type, W, H, false);
    if (!frame) return { image: canvas, note: 'Hittade ingen kropp i bilden. Prova en helfigursbild rakt framifrån.' };
    const prep = prepareGarment(garmentImage, type);
    if (!prep.ok) return { image: canvas, note: prep.reason };
    drawPrepared(ctx, prep, frame, W, adjust, 1);
    return { image: canvas };
  },
};
