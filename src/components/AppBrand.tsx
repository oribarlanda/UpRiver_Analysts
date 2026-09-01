import React from "react";
import Image from "next/image";
import {
  APP_DISPLAY_NAME,
  APP_LOGO_PATH,
  APP_NAME,
} from "@/lib/branding";

export default function AppBrand() {
  return (
    <div className="text-center">
      <Image
        src={APP_LOGO_PATH}
        alt={`לוגו ${APP_NAME}`}
        width={72}
        height={72}
        priority
        className="mx-auto h-16 w-16 rounded-[18px] shadow-sm sm:h-[72px] sm:w-[72px]"
      />
      <h1 className="mt-2 text-xl font-black tracking-[0.02em] text-slate-800 sm:text-2xl">
        {APP_DISPLAY_NAME}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        שיבוץ משמרות שבועי
      </p>
    </div>
  );
}
