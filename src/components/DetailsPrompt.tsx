import { useRef } from 'react';
import { Plus } from 'lucide-react';
import type { LocationContext } from '../../shared/types';

export const DETAILS_MAX = 1500;

const starters = [
  { label: 'HOA / Community', text: 'I think this is managed by ' },
  { label: 'Property manager', text: 'Private property or manager: ' },
  { label: 'Pole / Light #', text: 'The pole number is ' },
  { label: 'Landmark / Lane', text: 'Right next to ' },
  { label: 'Specific spot', text: 'Located in the ' },
];

interface DetailsPromptProps {
  value: string;
  onChange: (value: string) => void;
  context: LocationContext | null;
  disabled?: boolean;
}

export function DetailsPrompt({ value, onChange, context, disabled = false }: DetailsPromptProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const road = context?.road?.name || context?.road?.ref;
  const placeholder = `e.g. I think Greenbelt Station HOA handles this, or pole #12 on ${road || 'this road'}, right past the clubhouse.`;

  function addStarter(text: string) {
    const base = value.trimEnd();
    const joiner = !base ? '' : /[.!?]$/.test(base) ? ' ' : '. ';
    const next = `${base}${joiner}${text}`.slice(0, DETAILS_MAX);
    onChange(next);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(next.length, next.length);
    });
  }

  return (
    <div className="details-prompt">
      <div className="details-header-row">
        <label htmlFor="details" className="details-label">AI Research Clues & Feedback</label>
        <span className="badge-optional">Optional</span>
      </div>
      <p className="field-hint" id="details-hint">
        Have a hunch who handles this? Name an HOA (e.g. Greenbelt Station HOA), property manager, utility pole number, or landmark. Gemini prioritizes this in live web research.
      </p>
      <textarea
        id="details"
        ref={field}
        rows={3}
        maxLength={DETAILS_MAX}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby="details-hint"
        enterKeyHint="done"
        onChange={(event) => onChange(event.target.value)}
      />
      {value.length > DETAILS_MAX - 200 && <p className="field-hint counter">{DETAILS_MAX - value.length} characters left</p>}
      <div className="starter-chips" role="group" aria-label="Suggested clues">
        <span className="chips-label">Quick clues:</span>
        {starters.map((starter) => (
          <button key={starter.label} type="button" className="chip" disabled={disabled || value.length >= DETAILS_MAX} onClick={() => addStarter(starter.text)}>
            <Plus size={13} aria-hidden="true" />{starter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
