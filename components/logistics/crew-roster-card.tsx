"use client";

import { Users, Phone, MessageSquare, Clock } from "lucide-react";
import { parseCrewJson, type CrewMember } from "@/lib/whatsapp";

interface CrewRosterCardProps {
  crewJson?: string | null;
  generalCallTime: string;
}

export function CrewRosterCard({ crewJson, generalCallTime }: CrewRosterCardProps) {
  const crew: CrewMember[] = parseCrewJson(crewJson);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 sm:p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Users className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Crew Call Schedule
            </h3>
            <p className="text-xs text-zinc-400">
              Department call times & direct communication lines
            </p>
          </div>
        </div>
        <div className="text-xs font-mono font-medium px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
          General Call: {generalCallTime}
        </div>
      </div>

      {crew.length === 0 ? (
        <div className="text-center py-6 text-zinc-500 text-xs font-mono">
          No individual crew calls configured. Follow general call time.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {crew.map((member, idx) => {
            const cleanPhone = member.phone?.replace(/[^\d+]/g, "");
            const waPhone = cleanPhone
              ? cleanPhone.startsWith("+")
                ? cleanPhone.slice(1)
                : cleanPhone
              : "";

            return (
              <div
                key={idx}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3 hover:border-zinc-700 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm text-white leading-tight">
                      {member.name}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md shrink-0">
                      <Clock className="size-3" />
                      <span>{member.callTime || generalCallTime}</span>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">{member.role}</div>
                </div>

                {member.phone && (
                  <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] text-zinc-500 truncate mr-2">
                      {member.phone}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`tel:${cleanPhone}`}
                        title="Voice Call"
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                      >
                        <Phone className="size-3.5" />
                      </a>
                      {waPhone && (
                        <a
                          href={`https://wa.me/${waPhone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="WhatsApp Direct"
                          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors"
                        >
                          <MessageSquare className="size-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
