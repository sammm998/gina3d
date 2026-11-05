import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/useStore.js';
import { formatPrice } from '../i18n/index.js';
import { canTryOn, tryOnType } from '../data/productMeta.js';
import { detectImage, detectVideo, loadPoseLandmarker } from '../tryon/poseTracker.js';
import { anchorsFor, bodyFrame, drawGarment } from '../tryon/overlay.js';
import { MultiFilter } from '../tryon/smoothing.js';
import { listProviders } from '../tryon/providers/index.js';
import { loadImage } from '../scene/textures.js';

const DEFAULT_ADJUST = { scale: 1, offsetX: 0, offsetY: 0 };
const HOLD_MS = 700; // hur länge plagget ligger kvar om kroppen tappas

const HINT = {
  upper: 'Ställ dig 1–2 meter från kameran så att axlar och höfter syns.',
  lower: 'Backa så att höfter och knän syns i bild.',
  full: 'Backa så att du syns från axlarna ner till knäna.',
};

export default function TryOn() {
  const { open, productId } = useStore((s) => s.tryOn);
  const products = useStore((s) => s.products);
  const close = useStore((s) => s.closeTryOn);
  const tryables = useMemo(() => products.filter(canTryOn), [products]);

  const [garmentId, setGarmentId] = useState(null);
  const [mode, setMode] = useState(null); // 'camera' | 'upload'
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [adjust, setAdjust] = useState(DEFAULT_ADJUST);
  const [poseReady, setPoseReady] = useState(false);
  const [providerId, setProviderId] = useState('local-2d');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState(null); // { url, note } från extern tjänst
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const rawRef = useRef(null); // bild utan plagg (för extern tjänst)
  const streamRef = useRef(null);
  const garmentImg = useRef(null);
  const uploadImg = useRef(null);
  const uploadFrame = useRef(null);
  const adjustRef = useRef(adjust);
  const live = useRef({ frame: null, at: 0, busy: false, lastVideoTime: -1 });
  const filter = useRef(new MultiFilter(['cx', 'cy', 'width', 'angle', 'length'], { minCutoff: 1.2, beta: 0.8 }));

  const providers = listProviders();
  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const product = tryables.find((p) => p.id === garmentId) ?? null;
  const type = product ? tryOnType(product) : 'upper';
  adjustRef.current = adjust;

  // Öppna med vald produkt (eller första provbara).
  useEffect(() => {
    if (!open) return;
    setGarmentId((productId && tryables.find((p) => p.id === productId)?.id) || tryables[0]?.id || null);
    setError('');
    setResult(null);
    setStatus('Laddar kroppsigenkänning …');
    loadPoseLandmarker()
      .then(() => {
        setPoseReady(true);
        setStatus('');
      })
      .catch((e) => {
        console.error(e);
        setError('Kroppsigenkänningen kunde inte laddas. Kontrollera nätverket och försök igen.');
      });
  }, [open, productId, tryables]);

  // Läs in plaggets tryOnImage.
  useEffect(() => {
    if (!product) return;
    let alive = true;
    loadImage(product.tryOnImage).then((img) => alive && (garmentImg.current = img)).catch(() => setError('Plaggbilden kunde inte läsas.'));
    filter.current.reset();
    setAdjust(DEFAULT_ADJUST);
    setResult(null);
    return () => { alive = false; };
  }, [product]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Stäng: stoppa kameran.
  useEffect(() => {
    if (!open) {
      stopCamera();
      setMode(null);
      uploadImg.current = null;
    }
  }, [open, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Esc stänger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  async function startCamera() {
    setError('');
    setResult(null);
    setMode('camera');
    uploadImg.current = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Webbkamera stöds inte här. Kameran kräver https (eller localhost). Prova att ladda upp en bild i stället.');
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();
      filter.current.reset();
      live.current = { frame: null, at: 0, busy: false, lastVideoTime: -1 };
    } catch (e) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'Du nekade åtkomst till kameran. Tillåt kameran i webbläsaren eller ladda upp en bild.'
          : 'Kameran kunde inte startas. Prova att ladda upp en bild i stället.'
      );
    }
  }

  async function onUpload(file) {
    if (!file) return;
    stopCamera();
    setMode('upload');
    setError('');
    setResult(null);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      // skala ner stora bilder för snabbare analys
      const max = 1600;
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      uploadImg.current = c;
      setStatus('Analyserar bilden …');
      const lms = await detectImage(c);
      uploadFrame.current = { lms };
      setStatus('');
      if (!lms) setError('Hittade ingen person i bilden. Använd en helfigursbild där du står rakt framifrån.');
      redrawUpload();
    } catch (e) {
      console.error(e);
      setError('Bilden kunde inte läsas.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function redrawUpload() {
    const src = uploadImg.current;
    const canvas = canvasRef.current;
    if (!src || !canvas) return;
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(src, 0, 0);
    rawRef.current = src;
    const lms = uploadFrame.current?.lms;
    const p = tryables.find((x) => x.id === garmentId);
    if (!lms || !p || !garmentImg.current) return;
    const t = tryOnType(p);
    const frame = bodyFrame(lms, t, src.width, src.height, false);
    if (!frame) {
      setStatus(HINT[t]);
      return;
    }
    setStatus('');
    drawGarment(ctx, garmentImg.current, frame, anchorsFor(p, t), src.width, adjustRef.current);
  }

  // Rita om uppladdad bild när plagg eller reglage ändras.
  useEffect(() => {
    if (mode !== 'upload') return;
    const id = setTimeout(redrawUpload, 30);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, adjust, garmentId]);

  // Realtidsloop för webbkameran.
  useEffect(() => {
    if (!open || mode !== 'camera') return;
    let raf;
    const raw = document.createElement('canvas');
    rawRef.current = raw;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = videoRef.current;
      const canvas = canvasRef.current;
      if (!v || !canvas || v.readyState < 2 || !v.videoWidth) return;
      const W = v.videoWidth, H = v.videoHeight;
      if (canvas.width !== W) { canvas.width = W; canvas.height = H; raw.width = W; raw.height = H; }
      const ctx = canvas.getContext('2d');
      // spegelvänd selfie-vy
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(v, 0, 0, W, H);
      ctx.restore();
      const rctx = raw.getContext('2d');
      rctx.drawImage(canvas, 0, 0);

      const L = live.current;
      const now = performance.now();
      const p = productRef.current;
      if (poseReadyRef.current && !L.busy && v.currentTime !== L.lastVideoTime && p) {
        L.busy = true;
        L.lastVideoTime = v.currentTime;
        detectVideo(v, now)
          .then((lms) => {
            const f = bodyFrame(lms, tryOnType(p), W, H, true);
            if (f) {
              L.frame = filter.current.filter(f, now / 1000);
              L.at = performance.now();
            }
          })
          .catch(() => {})
          .finally(() => (L.busy = false));
      }
      const age = now - L.at;
      if (L.frame && age < HOLD_MS && garmentImg.current && p) {
        const alpha = age < 250 ? 1 : 1 - (age - 250) / (HOLD_MS - 250);
        drawGarment(ctx, garmentImg.current, L.frame, anchorsFor(p, tryOnType(p)), W, adjustRef.current, alpha);
        if (hintRef.current) setStatus((hintRef.current = ''));
      } else if (poseReadyRef.current && p && !hintRef.current) {
        hintRef.current = HINT[tryOnType(p)];
        setStatus(hintRef.current);
        filter.current.reset();
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [open, mode]);

  const productRef = useRef(product);
  productRef.current = product;
  const poseReadyRef = useRef(poseReady);
  poseReadyRef.current = poseReady;
  const hintRef = useRef('');

  function screenshot() {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width) return;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const fs = Math.max(12, Math.round(out.width / 70));
    ctx.font = `400 ${fs}px Inter Variable, Inter, Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const label = `${product?.name ?? ''} · Virtuell provning (2D-överlagring)`;
    const tw = ctx.measureText(label).width;
    ctx.fillRect(fs * 0.8, out.height - fs * 2.6, tw + fs * 1.4, fs * 1.8);
    ctx.fillStyle = '#111';
    ctx.fillText(label, fs * 1.5, out.height - fs * 1.35);
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `provning-${product?.id ?? 'bild'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  async function runExternal() {
    if (!provider || provider.realtime || !rawRef.current || !garmentImg.current || !product) return;
    setBusy(true);
    setError('');
    try {
      const res = await provider.render({ person: rawRef.current, product, garmentImage: garmentImg.current, adjust });
      const img = res.image;
      const url = img instanceof Blob ? URL.createObjectURL(img) : img.src || img.toDataURL?.();
      setResult({ url, note: res.note });
    } catch (e) {
      setError(`Den externa tjänsten svarade inte: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const sends = provider?.sendsImagesToServer;

  return (
    <div className="tryon" role="dialog" aria-label="Virtuell provning">
      <div className="tryon__stage">
        <video ref={videoRef} playsInline muted className="tryon__video" />
        <canvas ref={canvasRef} className={`tryon__canvas ${mode ? '' : 'is-empty'}`} />
        {result && <img className="tryon__result" src={result.url} alt="Resultat från extern provning" />}
        {!mode && (
          <div className="tryon__empty">
            <p className="eyebrow">Virtuell provning</p>
            <p>Välj webbkamera eller ladda upp en helfigursbild för att prova plagget.</p>
            <div className="tryon__modes">
              <button className="btn btn--primary" onClick={startCamera}>Använd webbkamera</button>
              <label className="btn">
                Ladda upp bild
                <input type="file" accept="image/*" hidden onChange={(e) => onUpload(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        )}
        {(status || error) && mode && <div className={`tryon__status ${error ? 'is-error' : ''}`}>{error || status}</div>}
        {!mode && error && <div className="tryon__status is-error">{error}</div>}
      </div>

      <aside className="tryon__side">
        <div className="panel__head tryon__head">
          <p className="eyebrow">Virtuell provning</p>
          <button className="panel__close" onClick={close} aria-label="Stäng provningen">×</button>
        </div>

        <div className={`privacy ${sends ? 'is-warning' : ''}`}>
          {sends ? (
            <>
              <strong>Bilden skickas till en extern tjänst.</strong> {provider.description} Inget skickas förrän du godkänner det nedan.
            </>
          ) : (
            <>
              <strong>🔒 Allt körs lokalt i din webbläsare.</strong> Inga bilder eller videobilder skickas till någon server.
              {' '}Endast själva igenkänningsmodellen laddas ner första gången.
            </>
          )}
        </div>

        <div className="tryon__modes tryon__modes--side">
          <button className={`btn ${mode === 'camera' ? 'btn--primary' : ''}`} onClick={startCamera}>Använd webbkamera</button>
          <label className={`btn ${mode === 'upload' ? 'btn--primary' : ''}`}>
            Ladda upp bild
            <input type="file" accept="image/*" hidden onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
        </div>

        {product && (
          <div className="tryon__product">
            <strong>{product.name}</strong>
            <span>{formatPrice(product.price, product.currency)}</span>
          </div>
        )}

        <div className="panel__group">
          <p className="panel__label">Byt plagg</p>
          <div className="garments">
            {tryables.map((p) => (
              <button key={p.id} className={`garment ${p.id === garmentId ? 'is-active' : ''}`} onClick={() => setGarmentId(p.id)} title={p.name} aria-label={p.name}>
                <img src={p.tryOnImage} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </div>

        <div className="panel__group">
          <p className="panel__label">Justera</p>
          <Slider label="Storlek" min={0.6} max={1.6} step={0.01} value={adjust.scale} onChange={(v) => setAdjust((a) => ({ ...a, scale: v }))} format={(v) => `${Math.round(v * 100)} %`} />
          <Slider label="Sidled" min={-0.6} max={0.6} step={0.01} value={adjust.offsetX} onChange={(v) => setAdjust((a) => ({ ...a, offsetX: v }))} />
          <Slider label="Höjd" min={-0.8} max={0.8} step={0.01} value={adjust.offsetY} onChange={(v) => setAdjust((a) => ({ ...a, offsetY: v }))} />
          <button className="btn btn--ghost-plain" onClick={() => setAdjust(DEFAULT_ADJUST)}>Återställ</button>
        </div>

        {providers.length > 1 && (
          <div className="panel__group">
            <p className="panel__label">Provningsläge</p>
            <select className="select" value={providerId} onChange={(e) => { setProviderId(e.target.value); setResult(null); setConsent(false); }}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {provider && !provider.realtime && (
              <>
                <label className="check">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  Jag godkänner att bilden skickas till tjänsten.
                </label>
                <button className="btn btn--primary" disabled={!consent || !mode || busy} onClick={runExternal}>
                  {busy ? 'Skapar bild …' : 'Skapa realistisk bild'}
                </button>
                {result && <button className="btn btn--ghost-plain" onClick={() => setResult(null)}>Tillbaka till överlagring</button>}
              </>
            )}
          </div>
        )}

        <div className="panel__actions">
          <button className="btn btn--primary btn--block" disabled={!mode} onClick={screenshot}>Ta skärmdump</button>
        </div>

        <p className="panel__note">
          <strong>Ärligt om tekniken:</strong> detta är en förenklad 2D-överlagring – plaggbilden skalas, roteras och placeras efter
          axlar, höfter och knän. Det är ingen fysisk tygsimulering, så passform, veck och fall kan skilja sig från verkligheten.
          Använd storleksguiden på ginatricot.com för att välja storlek.
        </p>
      </aside>
    </div>
  );
}

function Slider({ label, value, onChange, format = (v) => v.toFixed(2), ...rest }) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" value={value} onChange={(e) => onChange(Number(e.target.value))} {...rest} />
      <output>{format(value)}</output>
    </label>
  );
}
