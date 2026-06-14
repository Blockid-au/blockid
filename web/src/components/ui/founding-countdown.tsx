"use client";

import * as React from "react";
import { Clock } from "lucide-react";

interface Props {
  deadline: string; // ISO date string e.g. "2026-08-01"
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function calcTimeLeft(deadline: string): TimeLeft {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    expired: false,
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function FoundingCountdown({ deadline }: Props) {
  const [tl, setTl] = React.useState<TimeLeft>(() => calcTimeLeft(deadline));

  React.useEffect(() => {
    const id = setInterval(() => setTl(calcTimeLeft(deadline)), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (tl.expired) return null;

  const urgent = tl.days < 7;

  return (
    <div className={`inline-flex items-center gap-3 rounded-xl border px-5 py-3 ${urgent ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <Clock strokeWidth={1.75} className={`h-4 w-4 shrink-0 ${urgent ? "text-red-600" : "text-amber-600"}`} />
      <div className="flex items-center gap-2">
        {[
          { value: tl.days, label: "days" },
          { value: tl.hours, label: "hrs" },
          { value: tl.minutes, label: "min" },
          { value: tl.seconds, label: "sec" },
        ].map(({ value, label }, i) => (
          <React.Fragment key={label}>
            {i > 0 && <span className={`text-sm font-bold ${urgent ? "text-red-400" : "text-amber-400"}`}>:</span>}
            <div className="text-center">
              <div className={`text-xl font-bold font-mono tabular-nums ${urgent ? "text-red-700" : "text-amber-700"}`}>
                {pad(value)}
              </div>
              <div className={`text-[9px] uppercase tracking-wider font-medium ${urgent ? "text-red-500" : "text-amber-500"}`}>
                {label}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div className={`text-xs font-semibold ${urgent ? "text-red-700" : "text-amber-700"}`}>
        Early-bird ends
      </div>
    </div>
  );
}
