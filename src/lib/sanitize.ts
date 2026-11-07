import type { DOMPurify } from 'dompurify';

let purifier: Promise<DOMPurify> | null = null;

function loadPurifier(): Promise<DOMPurify> {
  // Loaded on demand: only a finished report with search suggestions needs it.
  purifier ??= import('dompurify').then(({ default: createDOMPurify }) => {
    // A private instance, so this hook never touches other DOMPurify users on the page.
    const instance = createDOMPurify(window);
    instance.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName !== 'A') return;
      const href = node.getAttribute('href') ?? '';
      // Suggestion chips link to Google Search over https; anything else loses its link.
      if (!/^https:\/\//i.test(href)) node.removeAttribute('href');
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    });
    return instance;
  });
  return purifier;
}

/**
 * Cleans Google's search-suggestion HTML (a `<style>` block, inline SVG logos, and `<a class="chip">`
 * links) for rendering. Scripts, event handlers, and non-https links are removed.
 * The `<style>` uses generic class names (`.container`, `.chip`), so render the result inside a shadow root.
 */
export async function sanitizeSearchSuggestions(html: string): Promise<string> {
  const instance = await loadPurifier();
  return instance.sanitize(html, {
    // The HTML starts with <style>; without FORCE_BODY the parser moves it to <head> and DOMPurify drops it.
    FORCE_BODY: true,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select'],
  });
}
