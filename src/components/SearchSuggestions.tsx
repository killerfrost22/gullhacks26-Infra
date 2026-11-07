import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';

export default function SearchSuggestions({ html }: { html: string[] }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const root = host.current.shadowRoot ?? host.current.attachShadow({ mode: 'open' });
    root.replaceChildren();
    for (const snippet of html) {
      const block = document.createElement('div');
      // Google supplies this metadata, not the generated report. Isolate its CSS and strip active content.
      block.innerHTML = DOMPurify.sanitize(snippet, {
        // Preserve the leading stylesheet so Google's light/dark logo rules survive parsing.
        FORCE_BODY: true,
        ADD_TAGS: ['style'],
        ADD_ATTR: ['target'],
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'base', 'link', 'meta'],
      });
      for (const link of block.querySelectorAll('a')) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      root.append(block);
    }
    return () => root.replaceChildren();
  }, [html]);

  if (!html.length) return null;
  return <div className="search-attribution"><div ref={host} role="region" aria-label="Search suggestions provided by Google" /></div>;
}
