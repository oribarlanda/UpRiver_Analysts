import {
  PREFERENCE_LABELS,
  PreferenceValue,
} from "@/lib/types";

export const PREFERENCE_STYLES: Record<
  PreferenceValue,
  {
    bg: string;
    text: string;
    border: string;
    symbol: string;
  }
> = {
  want: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-400",
    symbol: "✓✓",
  },

  can: {
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-300",
    symbol: "✓",
  },

  prefer_not: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-300",
    symbol: "!",
  },

  cannot: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-300",
    symbol: "✕",
  },
};

/**
 * Kept exported only because the admin component from earlier versions
 * imports these constants.
 *
 * There is no longer a user-facing unset state. Any missing value is
 * displayed and interpreted as "can".
 */
export const UNSET_STYLE =
  PREFERENCE_STYLES.can;

export const UNSET_LABEL =
  PREFERENCE_LABELS.can;

export default function PreferenceLegend() {
  const order: PreferenceValue[] = [
    "want",
    "can",
    "prefer_not",
    "cannot",
  ];

  return (
    <div className="no-print flex flex-wrap gap-2 text-xs">
      {order.map((preference) => (
        <span
          key={preference}
          className={`${PREFERENCE_STYLES[preference].bg} ${PREFERENCE_STYLES[preference].text} ${PREFERENCE_STYLES[preference].border} rounded-full border px-2 py-1 font-medium`}
        >
          {
            PREFERENCE_STYLES[
              preference
            ].symbol
          }{" "}
          {
            PREFERENCE_LABELS[
              preference
            ]
          }
        </span>
      ))}
    </div>
  );
}