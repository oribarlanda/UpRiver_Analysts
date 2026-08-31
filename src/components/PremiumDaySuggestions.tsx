import React from "react";
import { DAY_LABELS } from "../lib/types";
import type { PremiumDaySuggestion } from "../lib/premiumCalendar";

interface PremiumDaySuggestionsProps {
  suggestions: PremiumDaySuggestion[];
  premiumDays: number[];
  disabled: boolean;
  onAddDays: (suggestions: PremiumDaySuggestion[]) => void;
}

function formatDayAndMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

export default function PremiumDaySuggestions({
  suggestions,
  premiumDays,
  disabled,
  onAddDays,
}: PremiumDaySuggestionsProps) {
  if (suggestions.length === 0) {
    return null;
  }

  const premiumSet = new Set(premiumDays);
  const pendingSuggestions = suggestions.filter(
    (suggestion) => !premiumSet.has(suggestion.dayIndex)
  );

  return (
    <section className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-slate-600">
          הצעות לפי לוח השנה
        </h3>

        {suggestions.length > 1 &&
          pendingSuggestions.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAddDays(pendingSuggestions)}
              className="rounded-lg bg-purple-100 px-2.5 py-1.5 text-[11px] font-bold text-purple-800 transition hover:bg-purple-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              הוסף את כל ההצעות
            </button>
          )}
      </div>

      <div className="mt-2 space-y-1.5">
        {suggestions.map((suggestion) => {
          const isPremium = premiumSet.has(
            suggestion.dayIndex
          );

          return (
            <div
              key={`${suggestion.date}-${suggestion.name}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2"
            >
              <div className="min-w-0 text-xs text-slate-700">
                <span aria-hidden="true" className="ml-1">
                  {suggestion.kind === "national"
                    ? "🇮🇱"
                    : "🎉"}
                </span>

                <strong>{suggestion.name}</strong>

                <span className="text-slate-400">
                  {" "}·{" "}
                  {DAY_LABELS[suggestion.dayIndex]}{" "}
                  {formatDayAndMonth(suggestion.date)}
                </span>
              </div>

              {isPremium ? (
                <span className="text-[11px] font-bold text-emerald-700">
                  ✓ יום פרמיה
                </span>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAddDays([suggestion])}
                  aria-label={`הוסף את ${suggestion.name} ליום פרמיה`}
                  className="rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-purple-700 transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + הוסף ליום פרמיה
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
