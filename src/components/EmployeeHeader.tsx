import React from "react";
import Image from "next/image";
import { APP_LOGO_PATH, APP_NAME } from "@/lib/branding";
import PushNotifications from "./PushNotifications";

export default function EmployeeHeader({
  employeeName,
  onOpenChangelog,
  onLogout,
}: {
  employeeName: string;
  onOpenChangelog: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="no-print flex flex-nowrap items-center justify-between gap-1.5 sm:gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        <Image
          src={APP_LOGO_PATH}
          alt={`לוגו ${APP_NAME}`}
          width={32}
          height={32}
          priority
          className="h-8 w-8 shrink-0 rounded-lg shadow-sm"
        />
        <h1 className="truncate text-base font-bold sm:text-xl">
          שלום {employeeName}
        </h1>
      </div>

      <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1 whitespace-nowrap text-[11px] sm:gap-2 sm:text-sm">
        <PushNotifications />
        <button
          type="button"
          onClick={onOpenChangelog}
          className="rounded-full border border-slate-200 bg-white px-2 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 sm:px-2.5"
        >
          מה חדש?
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-full px-2 py-1.5 text-slate-500 underline sm:px-2.5"
        >
          התנתקות
        </button>
      </div>
    </header>
  );
}
