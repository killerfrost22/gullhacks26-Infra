import { GraduationCap, Landmark, Lightbulb, Route } from 'lucide-react';
import type { LocationContext } from '../../shared/types';
import { contextChips, type ContextChipKind } from '../lib/context';

const icons: Record<ContextChipKind, typeof Route> = { road: Route, campus: GraduationCap, area: Landmark, light: Lightbulb };

export function ContextChips({ context }: { context: LocationContext | null }) {
  const chips = contextChips(context);
  if (!chips.length) return null;
  return (
    <ul className="context-chips" aria-label="What the map says about this spot">
      {chips.map(({ kind, label }) => {
        const Icon = icons[kind];
        return <li key={`${kind}-${label}`} className={`context-chip ${kind}`}><Icon size={14} aria-hidden="true" />{label}</li>;
      })}
    </ul>
  );
}
