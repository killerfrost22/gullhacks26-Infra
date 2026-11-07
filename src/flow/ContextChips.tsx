import { Landmark, Lightbulb, Route, School } from 'lucide-react';
import type { LocationContext } from '../../shared/types';
import { contextFacts, type ContextFact } from '../lib/place';

const ICONS: Record<ContextFact['kind'], typeof Route> = {
  road: Route,
  campus: School,
  area: Landmark,
  light: Lightbulb,
};

/** Map facts for the pin. They're routing clues for the research, not proof of who maintains anything. */
export function ContextChips({ context }: { context: LocationContext }) {
  const facts = contextFacts(context);
  return (
    <div className="context">
      {facts.length > 0 ? (
        <ul role="list" className="chips" aria-label="Map facts for this spot">
          {facts.map((fact) => {
            const Icon = ICONS[fact.kind];
            return (
              <li key={`${fact.kind}-${fact.label}`} className="chip">
                <Icon size={16} aria-hidden="true" />
                <span>
                  {fact.label}
                  {fact.detail && <span className="chip-detail"> · {fact.detail}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="context-note">No map facts for this spot.</p>
      )}
      {context.partial && <p className="context-note">Some map data didn’t load, so a few facts may be missing.</p>}
    </div>
  );
}
