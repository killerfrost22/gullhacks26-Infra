import { useEffect, useRef, useState } from 'react';
import { sanitizeSearchSuggestions } from '../lib/sanitize';

/**
 * Google's search entry point for a grounded answer. Its terms require showing it whenever the answer
 * shows, exactly as provided (no changes to colours, fonts, or appearance), as wide as the answer.
 * It renders in a shadow root so its generic class names (`.container`, `.chip`) can't restyle the
 * page, and nothing is added inside. Width is handled only from outside: the host fills the answer
 * column and may shrink, so Google's own `.carousel { overflow: auto }` scrolls the chips.
 */
export function SearchSuggestions({ html }: { html: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let current = true;
    sanitizeSearchSuggestions(html)
      .then((clean) => {
        const host = hostRef.current;
        if (!current || !host) return;
        const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
        root.innerHTML = clean;
        setReady(clean.trim() !== '');
      })
      .catch(() => {
        if (current) setReady(false);
      });
    return () => {
      current = false;
    };
  }, [html]);

  return (
    <section className="result-block search-suggestions" aria-labelledby="suggestions-title" hidden={!ready}>
      <h3 id="suggestions-title" className="block-title">
        Search it yourself
      </h3>
      <div ref={hostRef} className="search-suggestions-body" />
    </section>
  );
}
