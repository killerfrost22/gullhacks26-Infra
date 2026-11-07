import { ArrowRight, ArrowUpRight, Siren } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '../router';

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={14} aria-hidden="true" className="ext-icon" />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

const FLOWS: { who: string; what: string; detail: ReactNode }[] = [
  {
    who: 'Google Gemini',
    what: 'Your resized photo, the pin you confirmed and its address, the map facts for it, and your note.',
    detail: (
      <>
        Only when you press “Find who fixes it”. We send requests with <code>store: false</code>, but Google keeps
        search-grounded requests for up to 30 days under its{' '}
        <Ext href="https://ai.google.dev/gemini-api/terms">Gemini API terms</Ext>.
      </>
    ),
  },
  {
    who: 'OpenStreetMap',
    what: 'Map tiles, address searches, and the pin’s location.',
    detail: (
      <>
        Your browser loads map tiles straight from OpenStreetMap, so it sees your IP address and the area you look at.
        Address search, the address for your pin, and map facts go through our server to Nominatim and Overpass. See
        the <Ext href="https://osmfoundation.org/wiki/Privacy_Policy">OSM Foundation privacy policy</Ext>.
      </>
    ),
  },
  {
    who: 'U.S. Census Bureau',
    what: 'The pin’s coordinates.',
    detail: 'Our server asks the Census geocoder whether the pin is inside city limits, and which county it’s in.',
  },
  {
    who: 'Fix Please',
    what: 'Nothing is stored.',
    detail:
      'No accounts, no database, no analytics, no cookies. Our server passes your report along and keeps nothing. To stop abuse, it counts requests per IP address in memory for up to 15 minutes.',
  },
];

export function PrivacyPage() {
  return (
    <div className="page privacy">
      <header className="page-hero on-dark">
        <div className="page-hero-inner">
          <p className="kicker">Privacy and transparency</p>
          <h1 className="display page-title" tabIndex={-1} data-route-heading>
            What we share, and with whom.
          </h1>
          <p className="page-lede">
            Fix Please has no accounts and keeps nothing. Your report lives in this page and is gone when you close it.
            Here is everything that leaves your device.
          </p>
        </div>
      </header>

      <div className="page-body">
        <section className="page-section" aria-labelledby="flows-title">
          <div className="section-head">
            <p className="kicker">Where your data goes</p>
            <h2 id="flows-title" className="display section-title">
              Four places, and why
            </h2>
          </div>
          <ul role="list" className="flows">
            {FLOWS.map((flow) => (
              <li key={flow.who} className="flow-row">
                <h3 className="flow-who">{flow.who}</h3>
                <div className="flow-what">
                  <p className="flow-sent">{flow.what}</p>
                  <p>{flow.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="page-section" aria-labelledby="device-title">
          <div className="section-head">
            <p className="kicker">On your device</p>
            <h2 id="device-title" className="display section-title">
              What never leaves your phone
            </h2>
          </div>
          <ol className="rules" role="list">
            <li className="rule">
              <h3>Your photo’s hidden data</h3>
              <p>
                Before upload, the photo is resized and re-encoded on your device. That removes its metadata: camera,
                time, and GPS.
              </p>
            </li>
            <li className="rule">
              <h3>Your photo’s GPS</h3>
              <p>
                If the photo has a location, we read it on your device only to suggest the pin. You confirm the spot, and
                only that pin is sent.
              </p>
            </li>
            <li className="rule">
              <h3>The bot check</h3>
              <p>
                A quiet proof of work (ALTCHA) runs in your browser for a moment. No puzzles, no tracking, no third
                party.
              </p>
            </li>
            <li className="rule">
              <h3>The email</h3>
              <p>You send it, from your own account. Fix Please never sends anything for you.</p>
            </li>
          </ol>
        </section>

        <section className="page-section emergency-panel" aria-labelledby="emergency-title">
          <Siren size={36} aria-hidden="true" />
          <div>
            <h2 id="emergency-title" className="display section-title">
              Not for emergencies
            </h2>
            <p>
              Fix Please is for routine repairs. If someone is hurt, wires are down, or there’s a gas smell or flooding,
              call your local emergency number.
            </p>
          </div>
        </section>

        <section className="page-cta" aria-labelledby="privacy-cta">
          <h2 id="privacy-cta" className="display section-title">
            Ready when you are.
          </h2>
          <Link to="/" className="btn btn--primary btn--lg">
            Report a problem <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}
