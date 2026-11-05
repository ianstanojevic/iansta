import { useState } from 'react';
import { championIcon, useDDragonVersion } from '../riot/ddragon';
import { champ } from './format';

/** Champion portrait from Data Dragon, falling back to initials. */
export function ChampIcon({ name, size = 32, round = false }: { name: string | null | undefined; size?: number; round?: boolean }) {
  const version = useDDragonVersion();
  const [failed, setFailed] = useState(false);
  const label = champ(name);
  return (
    <span
      className={`champ-icon${round ? ' round' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      title={label}
    >
      {name && version && !failed ? (
        <img src={championIcon(version, name)} alt={label} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        label.slice(0, 2)
      )}
    </span>
  );
}

export function Champ({ name, size = 28, sub }: { name: string | null | undefined; size?: number; sub?: string }) {
  return (
    <span className="champ">
      <ChampIcon name={name} size={size} />
      <span style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{champ(name)}</span>
        {sub && <span className="muted xs" style={{ display: 'block' }}>{sub}</span>}
      </span>
    </span>
  );
}
