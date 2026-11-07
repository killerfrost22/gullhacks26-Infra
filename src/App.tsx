import { useEffect, useRef, useState } from 'react';
import { SiteFooter, SiteHeader } from './components/SiteChrome';
import { ReportFlow } from './flow/ReportFlow';
import type { Scene } from './flow/state';
import { PrivacyPage } from './pages/PrivacyPage';
import { TechPage } from './pages/TechPage';
import { Link, usePath } from './router';

const ROUTES: Record<string, { title: string; canonical: string }> = {
  '/': { title: 'Fix Please · Find who fixes it', canonical: 'https://fixplease.work/' },
  '/tech': { title: 'How it’s built · Fix Please', canonical: 'https://fixplease.work/tech' },
  '/privacy': { title: 'Privacy · Fix Please', canonical: 'https://fixplease.work/privacy' },
};

// Dev-only `?scene=<name>` harness. `import.meta.env.DEV` is `false` in production builds,
// so this branch and the fixtures it imports are dropped from the bundle.
const sceneName = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('scene') : null;

function NotFound() {
  return (
    <div className="page">
      <header className="page-hero on-dark">
        <div className="page-hero-inner">
          <p className="kicker">Page not found</p>
          <h1 className="display page-title" tabIndex={-1} data-route-heading>
            Nothing to fix here.
          </h1>
          <p className="page-lede">This page doesn’t exist.</p>
          <div className="page-actions">
            <Link to="/" className="btn btn--primary btn--lg">
              Report a problem
            </Link>
          </div>
        </div>
      </header>
    </div>
  );
}

/** Where focus lands when you come back to the report: whatever the flow is showing now. */
const FLOW_FOCUS = [
  '#result-title',
  '#investigating-title',
  '.step[data-status="active"] .step-title',
  '[data-route-heading]',
];

export function App() {
  const path = usePath();
  const route = ROUTES[path];
  const shownPath = useRef(path);
  const mainRef = useRef<HTMLElement>(null);
  // Scroll position of the report, restored when you come back to it from another page.
  const flowScroll = useRef(0);
  const [scene, setScene] = useState<Scene | null | undefined>(sceneName ? undefined : null);

  useEffect(() => {
    if (!import.meta.env.DEV || !sceneName) return;
    void import('./dev/scenes').then(({ loadScene }) => loadScene(sceneName)).then(setScene);
  }, []);

  useEffect(() => {
    document.title = route?.title ?? 'Page not found · Fix Please';
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', route?.canonical ?? 'https://fixplease.work/');
    if (shownPath.current === path) return;
    shownPath.current = path;
    // A route change is a new page to a screen reader: announce its heading. The report keeps its place.
    const visible = mainRef.current?.querySelector<HTMLElement>('.route:not([hidden])');
    if (!visible) return;
    const selectors = path === '/' ? FLOW_FOCUS : ['[data-route-heading]', 'h1', 'h2'];
    const heading = selectors.map((selector) => visible.querySelector<HTMLElement>(selector)).find(Boolean);
    window.scrollTo({ top: path === '/' ? flowScroll.current : 0 });
    heading?.focus({ preventScroll: true });
  }, [path, route]);

  // Remember where you were in the report. Hiding it clamps the page's scroll, which fires one more
  // scroll event, possibly before this listener is removed; the URL has already changed by then, so skip it.
  useEffect(() => {
    if (path !== '/') return;
    const remember = () => {
      if (window.location.pathname === '/') flowScroll.current = window.scrollY;
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [path]);

  if (scene === undefined) return null;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} ref={mainRef}>
        {/* The report stays mounted all session, so visiting another page never loses your photo, pin, or answer. */}
        <div className="route" hidden={path !== '/'}>
          <ReportFlow scene={scene ?? undefined} />
        </div>
        {path !== '/' && (
          <div className="route" key={path}>
            {path === '/tech' ? <TechPage /> : path === '/privacy' ? <PrivacyPage /> : <NotFound />}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
