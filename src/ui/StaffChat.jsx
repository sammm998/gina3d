import { useEffect, useRef, useState } from 'react';
import { formatPrice } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';
import { staffById } from '../config/staff.js';
import { zoneById, zoneForCategory } from '../config/zones.js';
import { LEVELS } from '../config/storeConfig.js';

/** Produktkort i chatten – plagg i butiken kan visas på plats eller läggas i korgen. */
function Card({ c }) {
  const byId = useStore((s) => s.productsById);
  const inStore = c.in_store && byId[c.id];
  const p = inStore ? byId[c.id] : null;
  const image = c.image || p?.images?.[0];
  const zone = p ? zoneById(zoneForCategory(p.category)) : null;
  const go = () => {
    const spot = useStore.getState().productSpots[c.id];
    if (spot) useStore.getState().navigateTo(spot.x, spot.z, spot.lookAt, spot.level);
    useStore.getState().closeChat();
  };
  const add = () => {
    const ok = useStore.getState().addToCart(c.id, p?.sizes?.[0] ?? null, p?.colors?.[0] ?? null);
    useStore.getState().showToast(ok ? `${c.name} ligger i kundkorgen` : 'Finns redan i kundkorgen');
  };
  return (
    <div className="chat-card">
      {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <div className="chat-card__ph" />}
      <div className="chat-card__body">
        <strong>{c.name}</strong>
        <span>{c.price ? formatPrice(c.price, c.currency) : 'Pris visas i katalogen'}</span>
        <span className="chat-card__where">{inStore ? `I butiken · ${LEVELS[zone?.level || 0].short}${zone ? ` · ${zone.name}` : ''}` : 'Finns i webbutiken'}</span>
        <div className="chat-card__actions">
          {inStore && <button className="chip" onClick={go}>Visa i butiken</button>}
          {inStore && <button className="chip" onClick={add}>Lägg i korgen</button>}
          {inStore && <button className="chip" onClick={() => useStore.getState().select(c.id)}>Detaljer</button>}
          {!inStore && c.price != null && (
            <button className="chip" onClick={() => { useStore.getState().addToCart(c.id, null, null, { name: c.name, price: c.price, currency: c.currency, image: c.image, url: c.url }); useStore.getState().setCartOpen(true); }}>Lägg i korgen</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tryck för att prata, tryck igen för att skicka. Personalen svarar med röst. */
function MicButton({ disabled }) {
  const [rec, setRec] = useState(null);
  const [err, setErr] = useState('');
  const speaking = useStore((s) => s.speaking);
  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' });
        useStore.getState().sendVoice(blob);
      };
      mr.start();
      setRec(mr);
      // säkerhetsgräns: max 30 sekunder
      setTimeout(() => mr.state === 'recording' && mr.stop(), 30000);
    } catch {
      setErr('Mikrofonen kunde inte startas. Tillåt mikrofonen i webbläsaren.');
    }
  };
  const stop = () => {
    rec?.state === 'recording' && rec.stop();
    setRec(null);
  };
  return (
    <>
      <button type="button" className={`btn chat__mic ${rec ? 'is-rec' : ''} ${speaking ? 'is-speaking' : ''}`} disabled={disabled && !rec}
        onClick={rec ? stop : start} aria-label={rec ? 'Sluta prata och skicka' : 'Prata med personalen'} title={rec ? 'Tryck för att skicka' : 'Prata (röst)'}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          {rec ? <rect x="7" y="7" width="10" height="10" fill="currentColor" /> : <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />}
        </svg>
      </button>
      {err && <p className="chat__micerr" role="alert">{err}</p>}
    </>
  );
}

export default function StaffChat() {
  const chat = useStore((s) => s.chat);
  const close = useStore((s) => s.closeChat);
  const send = useStore((s) => s.sendChat);
  const [text, setText] = useState('');
  const list = useRef(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [chat.items.length, chat.pending]);
  if (!chat.open) return null;
  const staff = staffById(chat.staffId);
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    send(t);
  };
  const quick = ['Vad är nytt just nu?', 'Jag letar efter en svart klänning', 'Vilka jeans har ni?', 'Var hittar jag stickat?'];
  return (
    <aside className="panel panel--chat" role="dialog" aria-label={`Chatt med ${staff?.name}`}>
      <div className="panel__head">
        <div>
          <p className="eyebrow">Personal</p>
          <p className="chat__who">{staff?.name}</p>
        </div>
        <button className="panel__close" onClick={close} aria-label="Stäng chatten">×</button>
      </div>
      <div className="chat__list" ref={list}>
        {chat.items.map((m, i) => (
          <div key={i} className={`chat__msg chat__msg--${m.role}`}>
            <p>{m.text}</p>
            {m.cards?.length > 0 && <div className="chat__cards">{m.cards.map((c) => <Card key={c.url + c.id} c={c} />)}</div>}
          </div>
        ))}
        {chat.pending && <div className="chat__msg chat__msg--staff chat__typing"><span /><span /><span /></div>}
        {chat.items.length === 1 && (
          <div className="chat__quick">
            {quick.map((q) => <button key={q} className="chip" onClick={() => send(q)}>{q}</button>)}
          </div>
        )}
      </div>
      <form className="chat__form" onSubmit={submit}>
        <MicButton disabled={chat.pending} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Fråga ${staff?.name} om kläder och produkter …`} maxLength={1000} aria-label="Meddelande" />
        <button className="btn btn--primary" disabled={chat.pending || !text.trim()}>Skicka</button>
      </form>
      <p className="chat__note">
        {chat.mode === 'search'
          ? 'Personalchatten svarar med enkel produktsökning (ingen AI-nyckel inlagd på servern).'
          : 'Personalen är en AI-assistent. Svaren bygger på sortimentet på ginatricot.com.'}
      </p>
    </aside>
  );
}
