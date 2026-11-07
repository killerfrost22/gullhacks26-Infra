import type { MouseEvent, ReactNode } from 'react';
import { LogoMark } from './Logo';

/** Header shared by every page. `onBrandClick` lets the report flow reset in place instead of reloading. */
export function SiteHeader({ children, onBrandClick }: { children: ReactNode; onBrandClick?: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="/" aria-label="fixplease.work, start over" onClick={onBrandClick}>
          <LogoMark size={36} />
          <div className="brand-text">
            <span className="wordmark">fixplease<span>.work</span></span>
            <span className="brand-badge">CIVIC AI</span>
          </div>
        </a>
        <nav className="header-nav" aria-label="Site">{children}</nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>fixplease.work · Map data © OpenStreetMap contributors</p>
      </div>
    </footer>
  );
}
