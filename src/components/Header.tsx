import { CHROME } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';
import { useCopy } from '../i18n';

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />
  </svg>
);

export function Header() {
  const copy = useCopy();
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const startTour = useAppStore((s) => s.startTour);
  const chrome = CHROME[theme];

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[17px] font-semibold tracking-tight" style={{ color: chrome.text }}>
          {copy.app.title}
        </h1>
        <span className="num hidden text-[11px] sm:inline" style={{ color: chrome.textMuted }}>
          {copy.app.subtitle}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button type="button" className="chip" onClick={startTour}>
          ▸ {copy.ui.tour}
        </button>
        <div
          role="group"
          aria-label={copy.ui.language}
          className="flex overflow-hidden rounded-md border"
          style={{ borderColor: chrome.grid }}
        >
          {(['sv', 'en'] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLanguage(code)}
              aria-pressed={language === code}
              className="px-2 py-1 text-[10px] font-semibold uppercase transition-colors"
              style={{
                background: language === code ? `${chrome.marker}22` : 'transparent',
                color: language === code ? chrome.marker : chrome.textMuted,
              }}
            >
              {code}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="chip !px-2"
          aria-label={copy.ui.theme}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  );
}
