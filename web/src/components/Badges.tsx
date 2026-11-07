import type { Category, Severity } from "../lib/api.ts";
import { CATEGORY_LABELS, SEVERITY_LABELS, SEVERITY_STYLES } from "../lib/labels.ts";

const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`${base} ${SEVERITY_STYLES[severity].badge}`}>
      <span aria-hidden>{severity === "hazard" ? "⛔" : "●"}</span>
      Severity: {SEVERITY_LABELS[severity]}
    </span>
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  return <span className={`${base} bg-slate-100 text-slate-700 ring-slate-500/20`}>{CATEGORY_LABELS[category]}</span>;
}
