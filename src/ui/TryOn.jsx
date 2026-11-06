import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/useStore.js';
import { formatPrice } from '../i18n/index.js';
import { canTryOn, tryOnType } from '../data/productMeta.js';
import { detectImage, detectVideo, getLastMask, loadPoseLandmarker } from '../tryon/poseTracker.js';
import { bodyFrame, drawArmsOver, drawPrepared, drawTrousers } from '../tryon/overlay.js';
import { prepareGarment } from '../tryon/garmentPrep.js';
import { fitFrameToBody, maskCanvas } from '../tryon/bodyMask.js';
import { MultiFilter } from '../tryon/smoothing.js';
import { listProviders } from '../tryon/providers/index.js';
import { loadImage } from '../scene/textures.js';

const DEFAULT_ADJUST = { scale: 1, offsetX: 0, offsetY: 0 };
const HOLD_MS = 700; // hur länge plaggen ligger kvar om kroppen tappas
/** Ritordning: byxor/kjol under, klänning, överdel ytterst. */
const SLOTS = ['lower', 'full', 'upper'];
const SLOT_LABEL = { upper: 'Överdel', lower: 'Underdel', full: 'Klänning' };

const HINT = {
  upper: 'Ställ dig 1–2 meter från kameran, rakt framifrån, så att båda axlarna syns.',
  near: 'Backa lite – du är för nära kameran för att plagget ska passa.',
  lower: 'Backa så att höfter och knän syns i bild.',
  full: 'Backa så att du syns från axlarna ner till knäna.',
};

/** Axel-/höftbredden täcker mer än 42 % av bildens bredd → personen är för nära. */
const isNear = (f) => !!f && Math.hypot(f.x2 - f.x1, f.y2 - f.y1) > 0.42;

const newFilter = () => new MultiFilter(['x1', 'y1', 'x2', 'y2', 'x3', 'y3'], { minCutoff: 1.2, beta: 0.8 });

/** Lägger ett plagg i outfiten: klänning ersätter över-/underdel och tvärtom; klick igen tar bort. */
function withGarment(outfit, p) {
  const slot = tryOnType(p);
  if (!slot) return outfit;
  if (outfit[slot] === p.id) {
    const next = { ...outfit };
    delete next[slot];
    return next;
  }
  if (slot === 'full') return { full: p.id };
  const next = { ...outfit, [slot]: p.id };
  delete next.full;
  return next;
}

export default function TryOn() {
  const { open, productId, fromCart } = useStore((s) => s.tryOn);
  const products = useStore((s) => s.products);
  const cart = useStore((s) => s.cart);
  const close = useStore((s) => s.closeTryOn);
  const tryables = useMemo(() => products.filter(canTryOn), [products]);
  const byId = useMemo(() => Object.fromEntries(tryables.map((p) => [p.id, p])), [tryables]);
  const cartTryables = useMemo(
    () => [...new Set(cart.map((c) => c.id))].map((id) => byId[id]).filter(Boolean),
    [cart, byId]
  );

  const [outfit, setOutfit] = useState({}); // { upper?: id, lower?: id, full?: id }
  const [activeSlot, setActiveSlot] = useState('upper');
  const [adjusts, setAdjusts] = useState({}); // slot -> { scale, offsetX, offsetY }
  const [mode, setMode] = useState(null); // 'camera' | 'upload'
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [poseReady, setPoseReady] = useState(false);
  const [providerId, setProviderId] = useState('local-2d');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState(null); // { url, note } från extern tjänst
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const rawRef = useRef(null); // bild utan plagg (för extern tjänst)
  const streamRef = useRef(null);
  const imgs = useRef(new Map()); // produkt-id -> HTMLImageElement
  const uploadImg = useRef(null);
  const uploadLms = useRef(null);
  const uploadMask = useRef(null);
  const live = useRef({ frames: {}, busy: false, lastVideoTime: -1 });
  const filters = useRef({ upper: newFilter(), lower: newFilter(), full: newFilter() });
  const hintRef = useRef('');

  // Värden som realtidsloopen läser (uppdateras varje rendering).
  const state = useRef({});
  state.current = { outfit, adjusts, poseReady, byId };

  const providers = listProviders();
  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const worn = SLOTS.filter((s) => outfit[s]).map((s) => ({ slot: s, p: byId[outfit[s]] })).filter((x) => x.p);
  const activeProduct = byId[outfit[activeSlot]] ?? worn.at(-1)?.p ?? null;
  const adjust = adjusts[activeSlot] ?? DEFAULT_ADJUST;

  // Öppna: från kundkorgen klär vi på en överdel + underdel (eller en klänning).
  useEffect(() => {
    if (!open) return;
    let o = {};
    if (fromCart && cartTryables.length) {
      for (const p of cartTryables) {
        const slot = tryOnType(p);
        if (slot === 'full' && !o.upper && !o.lower && !o.full) o = { full: p.id };
        else if (slot !== 'full' && !o.full && !o[slot]) o[slot] = p.id;
      }
    } else {
      const p = (productId && byId[productId]) || tryables[0];
      if (p) o = withGarment({}, p);
    }
    setOutfit(o);
    setActiveSlot(Object.keys(o).find((k) => k === 'upper') || Object.keys(o)[0] || 'upper');
    setAdjusts({});
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId, fromCart]);

  // Läs in plaggbilderna för outfiten.
  useEffect(() => {
    for (const id of Object.values(outfit)) {
      if (imgs.current.has(id) || !byId[id]) continue;
      imgs.current.set(id, null);
      loadImage(byId[id].tryOnImage)
        .then((img) => imgs.current.set(id, img))
        .catch(() => setError('En plaggbild kunde inte läsas.'));
    }
    Object.values(filters.current).forEach((f) => f.reset());
    setResult(null);
  }, [outfit, byId]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setMode(null);
      uploadImg.current = null;
    }
  }, [open, stopCamera]);
  useEffect(() => () => stopCamera(), [stopCamera]);

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
      Object.values(filters.current).forEach((f) => f.reset());
      live.current = { frames: {}, busy: false, lastVideoTime: -1 };
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
      const max = 1600;
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      uploadImg.current = c;
      setStatus('Analyserar bilden …');
      uploadLms.current = await detectImage(c);
      uploadMask.current = getLastMask();
      setStatus('');
      if (!uploadLms.current) setError('Hittade ingen person i bilden. Använd en bild rakt framifrån där ansiktet och båda axlarna syns (för byxor och kjolar även höfter och knän).');
      redrawUpload();
    } catch (e) {
      console.error(e);
      setError('Bilden kunde inte läsas.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Ritar alla plagg i outfiten på ctx. frames: slot -> kroppsram. Returnerar ev. problem. */
  function drawOutfit(ctx, W, frames, alphaOf = () => 1, arms = null) {
    const { outfit: o, adjusts: a, byId: b } = state.current;
    let problem = '';
    for (const slot of SLOTS) {
      const id = o[slot];
      const p = b[id];
      const img = imgs.current.get(id);
      if (!p || !img) continue;
      // rensad plaggbild + ankare ur plaggets form (cachas per bild)
      const prep = prepareGarment(img, slot);
      if (!prep.ok) {
        problem = `${p.name}: ${prep.reason} Välj ett annat plagg.`;
        continue;
      }
      let f = frames[slot];
      if (!f) continue;
      const mask = arms?.mask;
      // bredd efter kroppens kontur och klippning mot bakgrunden
      if (mask) f = fitFrameToBody(f, mask, W, arms.H, arms.mirror, slot);
      const clip = mask ? { canvas: maskCanvas(mask), mirror: arms.mirror } : null;
      const adj = a[slot] ?? DEFAULT_ADJUST;
      // byxor ben för ben när benen syns, annars hela plagget
      if (slot === 'lower' && arms?.lms && drawTrousers(ctx, prep, f, arms.lms, W, arms.H, arms.mirror, adj, alphaOf(slot), clip)) continue;
      drawPrepared(ctx, prep, f, W, adj, alphaOf(slot), clip);
    }
    // armar och händer framför kroppen ska synas framför plagget
    if (arms && Object.keys(frames).length) drawArmsOver(ctx, arms.raw, arms.lms, W, arms.H, arms.mirror);
    return problem;
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
    const lms = uploadLms.current;
    if (!lms) return;
    const frames = {};
    const missing = [];
    for (const slot of SLOTS) {
      if (!state.current.outfit[slot]) continue;
      frames[slot] = bodyFrame(lms, slot, src.width, src.height, false);
      if (!frames[slot]) missing.push(slot);
    }
    const problem = drawOutfit(ctx, src.width, frames, undefined, { raw: src, lms, mask: uploadMask.current, H: src.height, mirror: false });
    const near = Object.values(frames).some(isNear);
    setStatus(problem || (missing.length ? HINT[missing[0]] : near ? HINT.near : ''));
  }

  // Rita om uppladdad bild när plagg eller reglage ändras (vänta in plaggbilder).
  useEffect(() => {
    if (mode !== 'upload') return;
    const ids = Object.values(outfit);
    let tries = 0;
    const tick = () => {
      if (ids.every((id) => imgs.current.get(id)) || tries++ > 40) redrawUpload();
      else id = setTimeout(tick, 50);
    };
    let id = setTimeout(tick, 20);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, adjusts, outfit]);

  // Realtidsloop för webbkameran.
  useEffect(() => {
    if (!open || mode !== 'camera') return;
    let raf;
    const raw = document.createElement('canvas');
    const det = document.createElement('canvas');
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
      raw.getContext('2d').drawImage(canvas, 0, 0);

      const L = live.current;
      const now = performance.now();
      const { outfit: o, poseReady: ready } = state.current;
      const slots = SLOTS.filter((s) => o[s]);
      if (ready && slots.length && !L.busy && v.currentTime !== L.lastVideoTime) {
        L.busy = true;
        L.lastVideoTime = v.currentTime;
        // detektera på en nedskalad bild (snabbare, mindre mask att läsa)
        const dk = Math.min(1, 480 / W);
        det.width = Math.round(W * dk);
        det.height = Math.round(H * dk);
        det.getContext('2d').drawImage(v, 0, 0, det.width, det.height);
        detectVideo(det, now)
          .then((lms) => {
            L.lms = lms;
            L.mask = getLastMask();
            for (const slot of slots) {
              const f = bodyFrame(lms, slot, W, H, true);
              if (f) L.frames[slot] = { frame: filters.current[slot].filter(f, now / 1000), at: performance.now() };
            }
          })
          .catch(() => {})
          .finally(() => (L.busy = false));
      }
      const frames = {};
      let missing = null;
      for (const slot of slots) {
        const fr = L.frames[slot];
        if (fr && now - fr.at < HOLD_MS) frames[slot] = fr.frame;
        else {
          missing ??= slot;
          filters.current[slot].reset();
        }
      }
      const problem = drawOutfit(ctx, W, frames, (slot) => {
        const age = now - (L.frames[slot]?.at ?? 0);
        return age < 250 ? 1 : Math.max(0, 1 - (age - 250) / (HOLD_MS - 250));
      }, { raw, lms: L.lms, mask: L.mask, H, mirror: true });
      const near = Object.values(frames).some(isNear);
      const hint = problem || (ready && missing ? HINT[missing] : ready && near ? HINT.near : '');
      if (hint !== hintRef.current) setStatus((hintRef.current = hint));
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [open, mode]);

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
    const label = `${worn.map((w) => w.p.name).join(' + ')} · Virtuell provning (2D-överlagring)`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(fs * 0.8, out.height - fs * 2.6, tw + fs * 1.4, fs * 1.8);
    ctx.fillStyle = '#111';
    ctx.fillText(label, fs * 1.5, out.height - fs * 1.35);
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'provning.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  async function runExternal() {
    const p = activeProduct;
    const img = p && imgs.current.get(p.id);
    if (!provider || provider.realtime || !rawRef.current || !img) return;
    setBusy(true);
    setError('');
    try {
      const res = await provider.render({ person: rawRef.current, product: p, garmentImage: img, adjust });
      const im = res.image;
      const url = im instanceof Blob ? URL.createObjectURL(im) : im.src || im.toDataURL?.();
      setResult({ url, note: res.note });
    } catch (e) {
      setError(`Den externa tjänsten svarade inte: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const choose = (p) => {
    const next = withGarment(outfit, p);
    setOutfit(next);
    const slot = tryOnType(p);
    if (next[slot]) setActiveSlot(slot);
  };
  const setAdjust = (fn) => setAdjusts((a) => ({ ...a, [activeSlot]: fn(a[activeSlot] ?? DEFAULT_ADJUST) }));

  if (!open) return null;
  const sends = provider?.sendsImagesToServer;
  const others = tryables.filter((p) => !cartTryables.includes(p));
  const GarmentButton = ({ p }) => {
    const on = Object.values(outfit).includes(p.id);
    return (
      <button className={`garment ${on ? 'is-active' : ''}`} onClick={() => choose(p)} title={`${p.name} – ${SLOT_LABEL[tryOnType(p)]}`} aria-pressed={on} aria-label={p.name}>
        <img src={p.tryOnImage} alt="" loading="lazy" decoding="async" />
      </button>
    );
  };

  return (
    <div className="tryon" role="dialog" aria-label="Virtuell provning">
      <div className="tryon__stage">
        <video ref={videoRef} playsInline muted className="tryon__video" />
        <canvas ref={canvasRef} className={`tryon__canvas ${mode ? '' : 'is-empty'}`} />
        {result && <img className="tryon__result" src={result.url} alt="Resultat från extern provning" />}
        {!mode && (
          <div className="tryon__empty">
            <p className="eyebrow">Virtuell provning</p>
            <p>Välj webbkamera eller ladda upp en helfigursbild för att prova {worn.length > 1 ? 'outfiten' : 'plagget'}.</p>
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
          <p className="eyebrow">{fromCart ? 'Provrummet' : 'Virtuell provning'}</p>
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

        {worn.length > 0 && (
          <div className="outfit">
            {worn.map(({ slot, p }) => (
              <button key={slot} className={`outfit__item ${slot === activeSlot ? 'is-active' : ''}`} onClick={() => setActiveSlot(slot)}>
                <span className="outfit__slot">{SLOT_LABEL[slot]}</span>
                <strong>{p.name}</strong>
                <span>{formatPrice(p.price, p.currency)}</span>
              </button>
            ))}
          </div>
        )}

        {fromCart && cartTryables.length === 0 && (
          <p className="panel__note panel__note--warn">
            {cart.length
              ? 'Plaggen i din kundkorg har ingen provbild ännu. Välj ett plagg nedan att prova.'
              : 'Din kundkorg är tom. Välj plagg nedan att prova, eller lägg plagg i kundkorgen i butiken.'}
          </p>
        )}
        {cartTryables.length > 0 && (
          <div className="panel__group">
            <p className="panel__label">Från din kundkorg</p>
            <div className="garments">
              {cartTryables.map((p) => <GarmentButton key={p.id} p={p} />)}
            </div>
          </div>
        )}
        <div className="panel__group">
          <p className="panel__label">{cartTryables.length ? 'Fler plagg' : 'Välj plagg'} – kombinera överdel och underdel</p>
          <div className="garments">
            {others.map((p) => <GarmentButton key={p.id} p={p} />)}
          </div>
        </div>

        <div className="panel__group">
          <p className="panel__label">Justera {activeProduct ? `– ${SLOT_LABEL[activeSlot].toLowerCase()}` : ''}</p>
          <Slider label="Storlek" min={0.6} max={1.6} step={0.01} value={adjust.scale} onChange={(v) => setAdjust((a) => ({ ...a, scale: v }))} format={(v) => `${Math.round(v * 100)} %`} />
          <Slider label="Sidled" min={-0.6} max={0.6} step={0.01} value={adjust.offsetX} onChange={(v) => setAdjust((a) => ({ ...a, offsetX: v }))} />
          <Slider label="Höjd" min={-0.8} max={0.8} step={0.01} value={adjust.offsetY} onChange={(v) => setAdjust((a) => ({ ...a, offsetY: v }))} />
          <button className="btn btn--ghost-plain" onClick={() => setAdjust(() => DEFAULT_ADJUST)}>Återställ</button>
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
          <strong>Ärligt om tekniken:</strong> detta är en förenklad 2D-överlagring – plaggbilderna skalas, roteras och placeras efter
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
