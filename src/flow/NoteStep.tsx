import { useRef } from 'react';
import { Plus } from 'lucide-react';
import { DETAILS_MAX_LENGTH } from '../../shared/types';

const CLUES = [
  { label: 'HOA', text: 'HOA: ' },
  { label: 'Property manager', text: 'Property manager: ' },
  { label: 'Pole number', text: 'Pole number: ' },
  { label: 'Landmark', text: 'Near: ' },
];

const COUNTER_FROM = 200;

interface NoteStepProps {
  value: string;
  onChange: (value: string) => void;
  /** No photo: the note is the only description of the problem, so it's required. */
  required: boolean;
}

export function NoteStep({ value, onChange, required }: NoteStepProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const left = DETAILS_MAX_LENGTH - value.length;

  function addClue(text: string) {
    const separator = value === '' || value.endsWith('\n') ? '' : '\n';
    const next = (value + separator + text).slice(0, DETAILS_MAX_LENGTH);
    onChange(next);
    // Focus now, so typing right after the tap lands in the note; React then sets the value and the caret ends up after it.
    textareaRef.current?.focus();
  }

  return (
    <div className="note-step field">
      <label className="field-label" htmlFor="note">
        {required ? (
          'What’s broken, and where exactly?'
        ) : (
          <>
            Where exactly, and what did you notice? <span className="optional">Optional</span>
          </>
        )}
      </label>
      <p className="field-hint" id="note-hint">
        {required
          ? 'Without a photo, this is how the office knows what to fix. Say what’s wrong, and add a lane, a landmark, or a pole number if you can.'
          : 'A lane, a landmark, a pole number, or who you think owns it. Clues like these often decide between the city, the state, and a utility.'}
      </p>
      <ul role="list" className="clue-chips" aria-label="Add a clue">
        {CLUES.map((clue) => (
          <li key={clue.label}>
            <button type="button" className="clue-chip" onClick={() => addClue(clue.text)}>
              <Plus size={16} aria-hidden="true" />
              {clue.label}
            </button>
          </li>
        ))}
      </ul>
      <textarea
        ref={textareaRef}
        id="note"
        className="textarea"
        rows={4}
        maxLength={DETAILS_MAX_LENGTH}
        value={value}
        required={required}
        aria-describedby={left <= COUNTER_FROM ? 'note-hint note-count' : 'note-hint'}
        placeholder={
          required
            ? 'Example: Deep pothole in the northbound lane, next to the bus stop.'
            : 'Example: Northbound lane, next to the bus stop. The light has been out for a week.'
        }
        onChange={(event) => onChange(event.target.value)}
      />
      {left <= COUNTER_FROM && (
        <p className="note-count" id="note-count" data-empty={left === 0 || undefined}>
          {left === 0 ? 'You’ve reached the limit.' : `${left} ${left === 1 ? 'character' : 'characters'} left`}
        </p>
      )}
    </div>
  );
}
