import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { REPO_URL } from '../components/SiteChrome';
import { Link } from '../router';

const FACTS = [
  { value: '2', label: 'Gemini calls per report', note: 'Research, then the report' },
  { value: '3', label: 'Map data sources', note: 'Overpass, U.S. Census, Nominatim' },
  { value: '0', label: 'Accounts or databases', note: 'Close the tab and it’s gone' },
  { value: '1', label: 'Node server', note: 'Serves the app and the API' },
];

const PIPELINE = [
  {
    title: 'Snap, if you want',
    text: 'A photo is optional; you can report with just a note. If you add one, it’s shrunk and re-encoded on your device, which strips its hidden data. If it had GPS, that only suggests the pin.',
    tags: ['exifr', 'Canvas API'],
  },
  {
    title: 'Pin and map facts',
    text: 'You confirm the exact spot. The server looks up the nearest road and route number, city limits and county, the campus, and mapped streetlights.',
    tags: ['Leaflet', 'Overpass', 'U.S. Census', 'Nominatim'],
  },
  {
    title: 'Research',
    text: 'Gemini reads your note, the map facts, and the photo if you added one, then searches official city, county, state, campus, and utility sites.',
    tags: ['Gemini', 'Google Search grounding', 'URL context'],
  },
  {
    title: 'Check every source',
    text: 'The server opens each cited page itself. Links that don’t load are dropped, quotes must match word for word, and contacts must be published there.',
    tags: ['Node.js', 'Zod'],
  },
  {
    title: 'Your email',
    text: 'The app drafts the email, with the photo attached if you added one. You edit it and send it from your own account.',
    tags: ['Web Share API', '.eml', 'mailto'],
  },
];

const LAYERS: { title: string; summary: string; items: [string, string][] }[] = [
  {
    title: 'In your browser',
    summary: 'A phone-first React app.',
    items: [
      ['React 19 + TypeScript', 'The step-by-step report flow, with types shared with the server'],
      ['Vite 8', 'Dev server and production build; the map and photo tools load only when needed'],
      ['Leaflet + OpenStreetMap', 'The map and the draggable pin'],
      ['exifr + Canvas API', 'Reads photo GPS, then resizes and strips metadata on your device'],
      ['altcha-lib in a Web Worker', 'Solves the self-hosted proof-of-work bot check without freezing the page'],
      ['DOMPurify', 'Cleans Google’s search suggestions before they’re shown'],
      ['Plain CSS, Lucide icons', 'Public Sans and Big Shoulders, self-hosted'],
    ],
  },
  {
    title: 'On the server',
    summary: 'One small API that keeps the Gemini key off your device.',
    items: [
      ['Node.js 24 + Express 5', 'The API, written in TypeScript and run with tsx'],
      ['Zod 4', 'Checks every request and the shape of the AI’s report'],
      ['express-rate-limit', 'Per-visitor limits on reports and lookups'],
      ['altcha-lib', 'Issues and verifies single-use bot-check challenges'],
      ['node:test', 'Offline tests for the API, map facts, research checks, and the email builder'],
    ],
  },
  {
    title: 'AI',
    summary: 'Google Gemini through the Interactions API, called with plain fetch and no SDK.',
    items: [
      ['Gemini 3.6 Flash', 'The default model; reads your note and any photo, and writes the report'],
      ['Google Search grounding', 'Finds official pages for the exact spot'],
      ['URL context', 'Reads those pages during the research call'],
      ['Structured output', 'A second call with no tools returns JSON that matches a Zod schema'],
    ],
  },
  {
    title: 'Map data',
    summary: 'Open, public sources, used as routing clues rather than proof.',
    items: [
      ['Overpass API', 'Road, route number, campus, and streetlights with their operator'],
      ['U.S. Census geocoder', 'Whether the pin is inside city limits, and the county'],
      ['Nominatim', 'Address search, reverse lookup, and backup map facts'],
      ['OpenStreetMap tiles', 'The map itself'],
    ],
  },
];

const TRUST = [
  {
    title: 'Links must load',
    text: 'A source counts only if the server opened it during your report. A made-up link never loads, so it’s dropped.',
  },
  {
    title: '“Confirmed” means proven',
    text: 'The sentence that shows who covers the road or asset must appear word for word on an official page. Anything less is labelled “Best match.”',
  },
  {
    title: 'Real contacts only',
    text: 'An email address or phone number shows up only if it’s published on an official page the server read.',
  },
  {
    title: 'No guessing',
    text: 'If no office can be named, the app says so and shows only the map facts. It never makes up an office.',
  },
];

export function TechPage() {
  return (
    <div className="page tech">
      <header className="page-hero on-dark">
        <div className="page-hero-inner">
          <p className="kicker">How it’s built</p>
          <h1 className="display page-title" tabIndex={-1} data-route-heading>
            One spot, one note, every source checked.
          </h1>
          <p className="page-lede">
            A phone-first React app and one small Node.js server. The server holds the Gemini key, gathers map facts for
            your pin, runs the research, and checks every source before you see it.
          </p>
          <div className="page-actions">
            <Link to="/" className="btn btn--primary btn--lg">
              Report a problem <ArrowRight size={20} aria-hidden="true" />
            </Link>
            <a className="btn btn--lg btn--on-dark" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              View the code <ArrowUpRight size={20} aria-hidden="true" />
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </header>

      <div className="page-body">
        <dl className="facts" aria-label="At a glance">
          {FACTS.map((fact) => (
            <div key={fact.label} className="fact">
              <dt>
                <span className="fact-label">{fact.label}</span>
                <span className="fact-note">{fact.note}</span>
              </dt>
              <dd className="display fact-value">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <section className="page-section" aria-labelledby="pipeline-title">
          <div className="section-head">
            <p className="kicker">The route</p>
            <h2 id="pipeline-title" className="display section-title">
              From the street to your email
            </h2>
            <p className="section-lede">
              Each stop adds a clue. Map facts steer the search, and the server checks the answer before you see it.
            </p>
          </div>
          <ol className="route" role="list">
            {PIPELINE.map((stop, index) => (
              <li key={stop.title} className="route-stop">
                <span className="route-num display" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="route-body">
                  <h3 className="route-title">{stop.title}</h3>
                  <p>{stop.text}</p>
                  <ul role="list" className="tags" aria-label="Built with">
                    {stop.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="page-section" aria-labelledby="stack-title">
          <div className="section-head">
            <p className="kicker">The stack</p>
            <h2 id="stack-title" className="display section-title">
              What each part does
            </h2>
          </div>
          <div className="layers">
            {LAYERS.map((layer) => (
              <section key={layer.title} className="layer" aria-labelledby={`layer-${layer.title}`}>
                <h3 id={`layer-${layer.title}`} className="layer-title">
                  {layer.title}
                </h3>
                <p className="layer-summary">{layer.summary}</p>
                <dl className="layer-list">
                  {layer.items.map(([name, role]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{role}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </section>

        <section className="page-section" aria-labelledby="trust-heading">
          <div className="section-head">
            <p className="kicker">Trust</p>
            <h2 id="trust-heading" className="display section-title">
              Why you can rely on the answer
            </h2>
          </div>
          <ol className="rules" role="list">
            {TRUST.map((rule) => (
              <li key={rule.title} className="rule">
                <h3>{rule.title}</h3>
                <p>{rule.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="page-cta" aria-labelledby="cta-title">
          <h2 id="cta-title" className="display section-title">
            Try it on something broken near you.
          </h2>
          <Link to="/" className="btn btn--primary btn--lg">
            Report a problem <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}
