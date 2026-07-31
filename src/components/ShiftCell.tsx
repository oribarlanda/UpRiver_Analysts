"use client";

import { PREFERENCE_LABELS, PreferenceValue } from "@/lib/types";
import { PREFERENCE_STYLES, UNSET_STYLE, UNSET_LABEL } from "./PreferenceLegend";

const CYCLE: PreferenceValue[] = ["want", "can", "prefer_not", "cannot"];

export default function ShiftCell({
  value,
  disabled,
  onChange,
}: {
  value: PreferenceValue | undefined;
  disabled: boolean;
  onChange: (next: PreferenceValue) => void;
}) {
  const isUnset = value === undefined;
  const style = isUnset ? UNSET_STYLE : PREFERENCE_STYLES[value];
  const label = isUnset ? UNSET_LABEL : PREFERENCE_LABELS[value];

  function handleClick() {
    if (disabled) return;
    if (isUnset) {
      onChange(CYCLE[0]);
      return;
    }
    const idx = CYCLE.indexOf(value);
    onChange(CYCLE[(idx + 1) % CYCLE.length]);
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
      <span className="text-base">{style.symbol}</span>
    </button>
  );
}
