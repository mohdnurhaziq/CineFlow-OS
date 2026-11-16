"use client";

import { ACCESS_AREAS, ACCESS_TICKS, levelAtLeast, type AccessArea, type AccessLevel, type AccessMap } from "@/lib/auth/access";
import { AREA_LABELS, LEVEL_LABELS, TICK_LABELS, VIEW_LEVEL_NOTE } from "@/lib/team/access-labels";

/** Only these two areas can be limited to a person's own work. */
const OWN_AREAS: AccessArea[] = ["bookings", "galleries"];

function levelsFor(area: AccessArea): AccessLevel[] {
  return OWN_AREAS.includes(area) ? ["NONE", "OWN", "VIEW", "MANAGE"] : ["NONE", "VIEW", "MANAGE"];
}

/**
 * Per-area levels and the three extra permissions. With a `baseline` (a role's access, when editing one
 * person's extras) each area only offers levels at or above the role's, and ticks the role has are locked on.
 */
export function AccessEditor({
  value,
  onChange,
  baseline,
  idPrefix = "access",
}: {
  value: AccessMap;
  onChange: (map: AccessMap) => void;
  baseline?: AccessMap;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {ACCESS_AREAS.map((area) => {
          const floor = baseline?.areas[area] ?? "NONE";
          const options = levelsFor(area).filter((l) => levelAtLeast(l, floor));
          const current = levelAtLeast(value.areas[area], floor) ? value.areas[area] : floor;
          return (
            <fieldset key={area} className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
              <legend className="sr-only">{AREA_LABELS[area]}</legend>
              <span className="text-sm text-zinc-200" aria-hidden="true">
                {AREA_LABELS[area]}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {options.map((level) => (
                  <label
                    key={level}
                    className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer select-none ${
                      current === level ? "border-amber-500 bg-amber-500/10 text-white" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name={`${idPrefix}-${area}`}
                      checked={current === level}
                      onChange={() => onChange({ ...value, areas: { ...value.areas, [area]: level } })}
                    />
                    {LEVEL_LABELS[level]}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        <p className="text-xs text-zinc-400 leading-relaxed">{VIEW_LEVEL_NOTE}</p>
      </div>

      <div className="space-y-3">
        {ACCESS_TICKS.map((tick) => {
          const locked = baseline?.ticks[tick] === true;
          return (
            <label key={tick} className={`flex gap-3 ${locked ? "opacity-70" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                className="mt-1 accent-amber-500"
                checked={locked || value.ticks[tick]}
                disabled={locked}
                onChange={(e) => onChange({ ...value, ticks: { ...value.ticks, [tick]: e.target.checked } })}
              />
              <span>
                <span className="block text-sm font-medium text-white">{TICK_LABELS[tick].title}</span>
                <span className="block text-xs text-zinc-400 mt-0.5 leading-relaxed">{TICK_LABELS[tick].description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
