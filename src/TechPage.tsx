import { useEffect, type ComponentType } from 'react';
import {
  ArrowRight, BrainCircuit, Camera, CircleCheck, ExternalLink, Mail, Map as MapIcon, MapPin, Monitor, Server, ShieldCheck, Sparkles,
} from 'lucide-react';
import { SiteFooter, SiteHeader } from './components/SiteChrome';

const REPO_URL = 'https://github.com/killerfrost22/gullhacks26-Infra';

type Icon = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

const stats = [
  { value: '2', label: 'Gemini passes', note: 'Research, then report' },
  { value: '3', label: 'Map data sources', note: 'Overpass, Census, Nominatim' },
  { value: '0', label: 'Accounts or databases', note: 'Close the tab and it’s gone' },
  { value: '1', label: 'Node server', note: 'Serves the app and the API' },
];

const pipeline: { icon: Icon; title: string; text: string; tags: string[] }[] = [
  { icon: Camera, title: 'Snap', text: 'The photo is shrunk and stripped of hidden data on your device. If it has GPS, that suggests the pin.', tags: ['exifr', 'Canvas API'] },
  { icon: MapPin, title: 'Pin & map facts', text: 'For the exact spot: the nearest road and route number, campus, city limits, and mapped streetlights.', tags: ['Leaflet', 'Overpass', 'U.S. Census', 'Nominatim'] },
  { icon: Sparkles, title: 'AI research', text: 'Gemini reads the photo and searches official city, county, state, campus, and utility sites.', tags: ['Gemini', 'Google Search', 'URL context'] },
  { icon: ShieldCheck, title: 'Source checks', text: 'The server opens every cited page. Contacts count only if they’re published there.', tags: ['Node.js', 'Zod'] },
  { icon: Mail, title: 'Your email', text: 'Edit the draft, then send it yourself with the photo attached.', tags: ['Web Share API', '.eml'] },
];

const layers: { icon: Icon; title: string; summary: string; items: [name: string, role: string][] }[] = [
  {
    icon: Monitor,
    title: 'Frontend',
    summary: 'Runs in your browser. Built phone-first.',
    items: [
      ['React 19', 'The step-by-step report flow'],
      ['TypeScript', 'One language for browser and server, with shared types'],
      ['Vite 8', 'Dev server and production build'],
      ['Leaflet + OpenStreetMap', 'The map and the draggable pin'],
      ['exifr + Canvas API', 'Reads photo GPS, then resizes and strips metadata on-device'],
      ['ALTCHA', 'Self-hosted proof-of-work bot check'],
      ['DOMPurify', 'Sanitizes Google search suggestions before display'],
      ['Lucide + Barlow', 'Icons and self-hosted fonts, styled with plain CSS'],
    ],
  },
  {
    icon: Server,
    title: 'Backend',
    summary: 'One small API that keeps the Gemini key off your device.',
    items: [
      ['Node.js 24 + Express 5', 'The API server, TypeScript run with tsx'],
      ['Zod 4', 'Validates every request and the AI’s structured report'],
      ['express-rate-limit', 'Per-visitor limits on reports and lookups'],
      ['altcha-lib', 'Verifies single-use bot-check proofs'],
      ['node:test', 'Unit tests for the API, research pipeline, and email builder'],
    ],
  },
  {
    icon: BrainCircuit,
    title: 'AI',
    summary: 'Google Gemini through the Interactions API, called directly with no SDK.',
    items: [
      ['Gemini 3.5 Flash-Lite', 'Reads the photo and writes the report'],
      ['Google Search grounding', 'Finds official pages for the exact spot'],
      ['URL context', 'Reads those pages directly'],
      ['Structured output', 'A second pass with no tools returns JSON matching a Zod schema'],
    ],
  },
  {
    icon: MapIcon,
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

const trust = [
  { title: 'Links must load', text: 'A source counts only if the server can open it right now. A made-up link never loads, so it’s dropped.' },
  { title: '“Confirmed” means proven', text: 'The sentence that shows who covers the road or asset must appear word for word on an official page.' },
  { title: 'Real contacts only', text: 'An email or phone number shows up only if it’s published on an official page we read.' },
  { title: 'Your data stays yours', text: 'No accounts, no database, no analytics. Photos lose their hidden data before they leave your device.' },
];

export function TechPage() {
  useEffect(() => { document.title = 'How Fix Please is built · fixplease.work'; }, []);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader>
        <a className="btn-link" href="/">Report a problem</a>
        <a className="btn-link" href="/tech" aria-current="page">Tech stack</a>
      </SiteHeader>

      <main id="main" className="tech-page">
        <section className="container tech-hero" aria-labelledby="tech-title">
          <div className="hero-eyebrow"><span className="eyebrow-dot" /><span>UNDER THE HOOD</span></div>
          <h1 id="tech-title">How Fix Please is <mark>built</mark></h1>
          <p className="lede">A phone-first React app and one small Node.js server. The server holds the Gemini key, gathers map facts for your pin, runs the AI research, and checks every source before you see it. A typical report takes <span style={{ whiteSpace: 'nowrap' }}>5–7 seconds</span>.</p>
          <div className="tech-actions">
            <a className="btn btn-sign" href="/"><span>Try it</span><ArrowRight size={20} aria-hidden /></a>
            <a className="btn btn-ghost" href={REPO_URL} target="_blank" rel="noopener noreferrer"><span>View the code on GitHub</span><ExternalLink size={18} aria-hidden /></a>
          </div>
          <ul className="tech-stats" aria-label="At a glance">
            {stats.map((stat) => (
              <li key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
                <small>{stat.note}</small>
              </li>
            ))}
          </ul>
        </section>

        <section className="container tech-block" aria-labelledby="pipeline-title">
          <div className="tech-section-head">
            <p className="tech-kicker">The pipeline</p>
            <h2 id="pipeline-title">From photo to email in one request</h2>
            <p className="tech-section-sub">Each step adds a clue. Map facts steer the AI’s search, and the server checks its work before you see it.</p>
          </div>
          <ol className="tech-pipeline">
            {pipeline.map(({ icon: StepIcon, title, text, tags }, index) => (
              <li key={title} className="card tech-step">
                <div className="tech-step-top">
                  <span className="tech-icon"><StepIcon size={22} strokeWidth={2} aria-hidden /></span>
                  <span className="tech-step-num" aria-hidden>0{index + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
                <ul className="tech-tags" aria-label="Built with">
                  {tags.map((tag) => <li key={tag}>{tag}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <section className="container tech-block" aria-labelledby="stack-title">
          <div className="tech-section-head">
            <p className="tech-kicker">The stack</p>
            <h2 id="stack-title">What each part does</h2>
          </div>
          <div className="tech-layers">
            {layers.map(({ icon: LayerIcon, title, summary, items }) => (
              <article key={title} className="card tech-layer" aria-labelledby={`layer-${title}`}>
                <header className="tech-layer-head">
                  <span className="tech-icon"><LayerIcon size={22} strokeWidth={2} aria-hidden /></span>
                  <div>
                    <h3 id={`layer-${title}`}>{title}</h3>
                    <p>{summary}</p>
                  </div>
                </header>
                <dl className="tech-list">
                  {items.map(([name, role]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{role}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="container tech-block" aria-labelledby="trust-title">
          <div className="tech-section-head">
            <p className="tech-kicker">Trust</p>
            <h2 id="trust-title">Why you can rely on the answer</h2>
          </div>
          <ul className="tech-trust">
            {trust.map((item) => (
              <li key={item.title} className="card">
                <CircleCheck size={24} aria-hidden />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="container" aria-labelledby="cta-title">
          <div className="tech-cta">
            <h2 id="cta-title">Try it on something broken near you.</h2>
            <p>Snap it, pin it, and get the right office with an email ready to send.</p>
            <div className="tech-actions">
              <a className="btn btn-sign" href="/"><span>Report a problem</span><ArrowRight size={20} aria-hidden /></a>
              <a className="btn btn-ghost" href={REPO_URL} target="_blank" rel="noopener noreferrer"><span>View the code</span><ExternalLink size={18} aria-hidden /></a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
