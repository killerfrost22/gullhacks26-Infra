import type { Analysis, Source } from "../lib/api.ts";

const LEVEL_LABELS: Record<Analysis["responsibleParty"]["jurisdictionLevel"], string> = {
  city: "City / town",
  county: "County",
  state: "State",
  federal: "Federal",
  utility: "Utility company",
  university: "University",
  private: "Private property owner",
  unknown: "Unknown",
};

function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function ExternalLink({ url, label }: { url: string; label: string }) {
  const href = safeHref(url);
  if (!href) return <span>{url}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="break-all text-teal-700 underline hover:text-teal-900">
      {label}
    </a>
  );
}

export function ResponsiblePartyCard({
  party,
  alternates,
}: {
  party: Analysis["responsibleParty"];
  alternates: Analysis["alternateParties"];
}) {
  const contacts = [
    party.reportingUrl && { label: "Report online", value: <ExternalLink url={party.reportingUrl} label={party.reportingUrl} /> },
    party.phone && { label: "Phone", value: <a href={`tel:${party.phone.replace(/[^\d+]/g, "")}`} className="text-teal-700 underline">{party.phone}</a> },
    party.email && { label: "Email", value: <a href={`mailto:${party.email}`} className="text-teal-700 underline">{party.email}</a> },
    party.website && { label: "Website", value: <ExternalLink url={party.website} label={party.website} /> },
  ].filter((c) => !!c);

  return (
    <section className="rounded-lg border border-teal-200 bg-teal-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Responsible party</p>
      <h3 className="mt-1 text-lg font-bold text-slate-900">{party.name}</h3>
      <p className="text-sm text-slate-600">
        {LEVEL_LABELS[party.jurisdictionLevel]}
        {party.department && ` · ${party.department}`}
      </p>
      <p className="mt-2 text-sm text-slate-700">{party.reasoning}</p>
      {contacts.length > 0 ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {contacts.map((c) => (
            <div key={c.label} className="contents">
              <dt className="font-medium text-slate-500">{c.label}</dt>
              <dd className="min-w-0">{c.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No verified contact details were found in search results.</p>
      )}
      {alternates.length > 0 && (
        <div className="mt-3 border-t border-teal-200 pt-3 text-sm">
          <p className="font-medium text-slate-600">Could also be:</p>
          <ul className="mt-1 list-disc pl-5 text-slate-700">
            {alternates.map((a) => (
              <li key={a.name}>
                <span className="font-medium">{a.name}</span> — {a.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function SourcesList({ sources, queries }: { sources: Source[]; queries?: string[] }) {
  if (sources.length === 0 && !queries?.length) return null;
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">
        Sources Gemini used ({sources.length})
      </summary>
      {queries && queries.length > 0 && (
        <p className="mt-2 text-slate-500">Searched: {queries.map((q) => `“${q}”`).join(", ")}</p>
      )}
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {sources.map((s) => (
          <li key={s.uri}>
            <ExternalLink url={s.uri} label={s.title} />
          </li>
        ))}
      </ol>
    </details>
  );
}
