import {
  PREFERENCE_LABELS,
  PreferenceValue,
} from "./types";

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

/** Missing preferences retain the existing "can" interpretation. */
export const UNSET_STYLE = PREFERENCE_STYLES.can;
export const UNSET_LABEL = PREFERENCE_LABELS.can;
