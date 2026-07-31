export default function CompletionBar({ completed, total = 21 }: { completed: number; total?: number }) {
  const percent = Math.round((completed / total) * 100);
  return (
    <div className="no-print space-y-1">
      <div className="flex justify-between text-xs text-slate-600">
        <span>הושלמו {completed} מתוך {total} משמרות</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
