import { PREFERENCE_LABELS, PreferenceValue } from "@/lib/types";

export const PREFERENCE_STYLES: Record<PreferenceValue, { bg: string; text: string; border: string; symbol: string }> = {
  want: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-400", symbol: "✓✓" },
  can: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-300", symbol: "✓" },
  prefer_not: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-300", symbol: "!" },
  cannot: { bg: "bg-red-50", text: "text-red-700", border: "border-red-300", symbol: "✕" },
};

/** Style for a shift that has no saved preference yet. Deliberately
 * distinct (grey, dashed, neutral symbol) from "can" so a missing answer
 * is never visually confused with an explicit "can" answer. */
export const UNSET_STYLE = {
  bg: "bg-slate-100",
  text: "text-slate-400",
  border: "border-slate-300 border-dashed",
  symbol: "?",
};
export const UNSET_LABEL = "טרם סומן";

export default function PreferenceLegend() {
  const order: PreferenceValue[] = ["want", "can", "prefer_not", "cannot"];
  return (
    <div className="no-print flex flex-wrap gap-2 text-xs">
      <span
        className={`${UNSET_STYLE.bg} ${UNSET_STYLE.text} ${UNSET_STYLE.border} rounded-full border px-2 py-1 font-medium`}
      >
        {UNSET_STYLE.symbol} {UNSET_LABEL}
      </span>
      {order.map((p) => (
        <span
          key={p}
          className={`${PREFERENCE_STYLES[p].bg} ${PREFERENCE_STYLES[p].text} ${PREFERENCE_STYLES[p].border} rounded-full border px-2 py-1 font-medium`}
        >
          {PREFERENCE_STYLES[p].symbol} {PREFERENCE_LABELS[p]}
        </span>
      ))}
    </div>
  );
}
