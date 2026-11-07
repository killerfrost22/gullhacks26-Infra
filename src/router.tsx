import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

export function usePath(): string {
  // "/tech/" and "/tech" are the same page.
  return useSyncExternalStore(subscribe, () => window.location.pathname.replace(/(.)\/+$/, '$1'));
}

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState(null, '', to);
  for (const listener of listeners) listener();
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** An in-app link: a real `<a href>` (so it works without JS and in new tabs) that skips the page load. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const path = usePath();
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === '_blank'
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  }
  return <a href={to} aria-current={path === to ? 'page' : undefined} onClick={handleClick} {...rest} />;
}
