export type SaveState = "idle" | "saving" | "saved" | "error";

export default function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;

  const config: Record<Exclude<SaveState, "idle">, { text: string; className: string }> = {
    saving: { text: "שומר...", className: "bg-slate-100 text-slate-600" },
    saved: { text: "נשמר ✓", className: "bg-emerald-100 text-emerald-700" },
    error: { text: "שגיאה בשמירה", className: "bg-red-100 text-red-700" },
  };

  const { text, className } = config[state];

  return (
    <div
      className={`no-print fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-md transition-opacity ${className}`}
    >
      {text}
    </div>
  );
}
