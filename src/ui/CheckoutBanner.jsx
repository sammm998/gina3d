import { useEffect, useState } from 'react';
import { formatPrice } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';

/** Visas när kunden kommer tillbaka från Stripe (?kop=klart / ?kop=avbrutet). */
export default function CheckoutBanner() {
  const [state, setState] = useState(null);
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const kop = qs.get('kop');
    if (!kop) return;
    const clean = () => window.history.replaceState(null, '', window.location.pathname);
    if (kop === 'avbrutet') {
      setState({ kind: 'info', text: 'Betalningen avbröts. Plaggen ligger kvar i kundkorgen.' });
      clean();
      return;
    }
    const id = qs.get('session_id');
    fetch(`/api/checkout/status?session_id=${encodeURIComponent(id || '')}`)
      .then((r) => r.json())
      .then((s) => {
        if (s.paid) {
          useStore.getState().clearCart();
          setState({ kind: 'ok', text: `Tack för ditt köp! Vi har tagit emot ${formatPrice(s.amount, (s.currency || 'sek').toUpperCase())}${s.email ? ` – kvittot skickas till ${s.email}` : ''}.` });
        } else setState({ kind: 'info', text: 'Betalningen är inte klar ännu.' });
      })
      .catch(() => setState({ kind: 'info', text: 'Kunde inte kontrollera betalningen.' }))
      .finally(clean);
  }, []);
  if (!state) return null;
  return (
    <div className={`checkout-banner is-${state.kind}`} role="status">
      <span>{state.text}</span>
      <button onClick={() => setState(null)} aria-label="Stäng">×</button>
    </div>
  );
}
