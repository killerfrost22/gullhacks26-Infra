import { Siren } from 'lucide-react';
import { Link } from '../router';
import { Wordmark } from './Mark';

export const REPO_URL = 'https://github.com/killerfrost22/gullhacks26-Infra';

export function SiteHeader() {
  return (
    <header className="site-header on-dark">
      <div className="site-header-inner">
        <Link to="/" className="brand" aria-label="Fix Please, report a problem">
          <Wordmark className="brand-word" />
        </Link>
        <nav aria-label="Main" className="site-nav">
          <Link to="/" className="nav-link nav-link--report">
            Report
          </Link>
          <Link to="/tech" className="nav-link">
            <span className="nav-long">How it’s built</span>
            <span className="nav-short">Tech</span>
          </Link>
          <Link to="/privacy" className="nav-link">
            Privacy
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer on-dark">
      <div className="site-footer-inner">
        <div className="footer-emergency" role="note" aria-label="Not for emergencies">
          <Siren size={28} aria-hidden="true" />
          <p>
            <strong>Not for emergencies.</strong> If someone is hurt, or wires are down, call your local emergency
            number.
          </p>
        </div>
        <div className="footer-grid">
          <p className="footer-brand">
            <Wordmark className="footer-word" />{' '}
            <span className="nowrap">fixplease.work</span>
          </p>
          <ul role="list" className="footer-links">
            <li>
              <Link to="/tech">How it’s built</Link>
            </li>
            <li>
              <Link to="/privacy">Privacy</Link>
            </li>
            <li>
              <a href={REPO_URL} rel="noopener noreferrer" target="_blank">
                Source code<span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
          <p className="footer-small">
            No accounts, no database, no analytics. You send the email yourself. Built at GullHacks 2026.
          </p>
          <p className="footer-small">
            Map data ©{' '}
            <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">
              OpenStreetMap contributors
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
