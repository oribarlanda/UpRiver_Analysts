"use client";

import {
  PREFERENCE_LABELS,
  PreferenceValue,
} from "@/lib/types";
import {
  PREFERENCE_STYLES,
} from "./PreferenceLegend";

const CYCLE: PreferenceValue[] = [
  "can",
  "want",
  "prefer_not",
  "cannot",
];

export default function ShiftCell({
  value,
  disabled,
  onChange,
}: {
  value: PreferenceValue | undefined;
  disabled: boolean;
  onChange: (next: PreferenceValue) => void;
}) {
  /**
   * "can" is the permanent default.
   *
   * `undefined` is supported only defensively in case an old client/API
   * response is encountered. It is never presented as a fifth state.
   */
  const resolvedValue: PreferenceValue =
    value ?? "can";

  const style =
    PREFERENCE_STYLES[resolvedValue];

  const label =
    PREFERENCE_LABELS[resolvedValue];

  function handleClick() {
    if (disabled) return;

    const currentIndex =
      CYCLE.indexOf(resolvedValue);

    const next =
      CYCLE[
        (currentIndex + 1) %
          CYCLE.length
      ];

    onChange(next);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${style.bg} ${style.text} ${style.border} flex h-14 w-full flex-col items-center justify-center rounded-lg border-2 text-xs font-semibold transition active:scale-95 disabled:opacity-70`}
    >
      <span className="text-base">
        {style.symbol}
      </span>
    </button>
  );
}