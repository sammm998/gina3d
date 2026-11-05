import { t } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';
import Logo from './Logo.jsx';

export default function StartScreen({ ready }) {
  const enter = useStore((s) => s.enter);
  const isTouch = useStore((s) => s.isTouch);
  return (
    <div className="start">
      <div className="start__card">
        <Logo className="start__logo" />
        <p className="eyebrow">{t('start.title')}</p>
        <p className="start__lead">{t('start.lead')}</p>
        <button className="btn btn--primary btn--large" disabled={!ready} onClick={enter} autoFocus>
          {ready ? t('start.enter') : t('start.loading')}
        </button>
        <p className="start__help">{isTouch ? t('start.touch') : t('start.desktop')}</p>
        <p className="start__note">{t('start.disclaimer')}</p>
      </div>
    </div>
  );
}
