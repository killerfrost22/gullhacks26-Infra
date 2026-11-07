import type { Ref } from 'react';
import { ExternalLink, X } from 'lucide-react';

const REPO_URL = 'https://github.com/killerfrost22/gullhacks26-Infra';

const sections: { title: string; items: [name: string, role: string][] }[] = [
  {
    title: 'In your browser',
    items: [
      ['React 19 + TypeScript', 'The step-by-step reporting flow, built with Vite 8 and plain CSS.'],
      ['Leaflet + OpenStreetMap', 'The map and the draggable pin.'],
      ['exifr + Canvas', 'Reads GPS from your photo, then shrinks it and strips its hidden data on your device.'],
      ['ALTCHA', 'A self-hosted proof-of-work bot check. No third-party CAPTCHA.'],
      ['Web Share API + .eml', 'Hands the email to your phone’s share sheet or your mail app with the photo attached.'],
      ['DOMPurify', 'Cleans Google’s search suggestions before they are shown.'],
      ['Lucide + Barlow', 'Icons and self-hosted fonts.'],
    ],
  },
  {
    title: 'On our server',
    items: [
      ['Node.js + Express 5', 'One small API server, written in TypeScript and run with tsx. It keeps the Gemini key off your device.'],
      ['Zod', 'Validates every request and the AI’s structured report.'],
      ['express-rate-limit + altcha-lib', 'Rate limits and bot-check verification protect the paid AI calls.'],
    ],
  },
  {
    title: 'AI',
    items: [
      ['Google Gemini 3.5 Flash-Lite', 'Called through the Gemini Interactions API. It reads the photo and researches with Google Search grounding and URL context.'],
      ['Two passes', 'First the research, then a separate call with no tools that turns the findings into a structured report.'],
    ],
  },
  {
    title: 'Map facts',
    items: [
      ['Overpass API', 'Nearest road and route number, the campus you’re on, and mapped streetlights with their operator (OpenStreetMap data).'],
      ['U.S. Census Bureau', 'Whether the pin is inside city limits, and which county it’s in.'],
      ['Nominatim', 'Address search, the address for a pin, and backup map facts when Overpass is busy.'],
    ],
  },
  {
    title: 'Trust checks',
    items: [
      ['Source verification', 'The server opens every cited page. “Confirmed” needs the proof sentence word for word, and an email or phone shows only if it’s published on an official page.'],
    ],
  },
  {
    title: 'Built and tested with',
    items: [
      ['TypeScript 7 + node:test', 'Type checks plus unit tests for the server and the email builder.'],
      ['One Node process', 'The same server serves the app and the API in production.'],
    ],
  },
];

export function TechStackDialog({ ref, onClose }: { ref: Ref<HTMLDialogElement>; onClose: () => void }) {
  return (
    <dialog ref={ref} className="site-dialog" aria-labelledby="tech-title" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id="tech-title">How Fix Please is built</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <p className="dialog-lede">A React web app and a small Node.js server. The server holds the Gemini key, gathers map facts for your pin, runs the AI research, and checks every source before you see it.</p>
        <ol className="tech-flow" aria-label="How a report flows">
          {['Photo', 'Map facts', 'Gemini research', 'Source checks', 'Your email'].map((stage) => <li key={stage}><span>{stage}</span></li>)}
        </ol>
        {sections.map((section, index) => (
          <section key={section.title} className="tech-section" aria-labelledby={`tech-section-${index}`}>
            <h3 id={`tech-section-${index}`}>{section.title}</h3>
            <dl>
              {section.items.map(([name, role]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{role}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <div className="tech-actions">
          <a className="btn btn-ghost btn-block" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <span>View the code on GitHub</span>
            <ExternalLink size={18} aria-hidden="true" />
          </a>
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>Got it</button>
        </div>
      </div>
    </dialog>
  );
}
