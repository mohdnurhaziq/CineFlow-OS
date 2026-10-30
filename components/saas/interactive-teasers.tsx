"use client";

import { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckSquare, Square, Calculator, Sparkles } from "lucide-react";

export function InteractiveTeasers() {
  // --- Demo 1: Slot Countdown State ---
  const [secondsRemaining, setSecondsRemaining] = useState<number>(599); // 09:59
  const [isRunning, setIsRunning] = useState<boolean>(true);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isUrgent = secondsRemaining < 120 && secondsRemaining > 0;

  const simulateUrgent = () => {
    setSecondsRemaining(105); // 01:45
    setIsRunning(true);
  };

  const resetTimer = () => {
    setSecondsRemaining(600);
    setIsRunning(true);
  };

  // --- Demo 2: Proposal Recalculator State ---
  const basePackagePrice = 2500;
  const [addOns, setAddOns] = useState([
    { id: "drone", name: "4K Drone Aerial Coverage", price: 450, selected: true },
    { id: "ssd", name: "RAW Footage 2TB NVMe SSD", price: 300, selected: false },
    { id: "shooter", name: "2nd Cinematographer / Camera B", price: 600, selected: true },
  ]);

  const toggleAddOn = (id: string) => {
    setAddOns((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const addOnTotal = addOns.filter((a) => a.selected).reduce((sum, a) => sum + a.price, 0);
  const subtotal = basePackagePrice + addOnTotal;
  const deposit50 = subtotal * 0.5;
  const balance50 = subtotal * 0.5;

  return (
    <section id="demo" className="py-20 border-t border-zinc-800/60 bg-[#0c0c0f]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-400">
            <Sparkles className="size-3.5 text-amber-400" />
            <span>HANDS-ON MICRO-INTERACTIONS</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Experience CineFlow OS in Action
          </h2>
          <p className="text-zinc-400 text-base">
            Test the live slot countdown timer and reactive proposal calculator directly below.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Interactive Widget 1: Slot Countdown */}
          <div className="p-6 sm:p-8 rounded-2xl border border-zinc-800 bg-[#121215] flex flex-col justify-between space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400">
                  WIDGET 01 // CALENDAR ENGINE
                </span>
                <span className="text-xs font-mono text-zinc-400">Slot #SLOT-9021</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">10-Minute Slot Holding Lease</h3>
              <p className="text-xs text-zinc-400">
                Guarantees exclusive booking rights. Tabular numerals prevent layout jitter; an ambient pulse warns clients under 2 minutes.
              </p>
            </div>

            {/* Countdown Box */}
            <div
              className={`p-6 rounded-xl border text-center transition-all ${
                isUrgent
                  ? "bg-amber-500/10 border-amber-500/60 animate-pulse text-amber-300"
                  : "bg-zinc-900/60 border-zinc-800 text-amber-400"
              }`}
            >
              <div className="flex items-center justify-center gap-2 mb-1">
                {isUrgent ? (
                  <AlertTriangle className="size-4 text-amber-400" />
                ) : (
                  <Clock className="size-4 text-zinc-400" />
                )}
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  {isUrgent ? "HOLD EXPIRING SOON" : "EXCLUSIVE HOLD ACTIVE"}
                </span>
              </div>

              <div className="font-mono text-5xl sm:text-6xl font-black tracking-wider tabular-nums my-2">
                {formattedTime}
              </div>

              {/* Progress Rail */}
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-3 max-w-xs mx-auto">
                <div
                  className={`h-full transition-all duration-1000 ease-linear ${
                    isUrgent ? "bg-amber-500" : "bg-amber-400"
                  }`}
                  style={{ width: `${(secondsRemaining / 600) * 100}%` }}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={simulateUrgent}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-white transition-all active:scale-[0.98]"
              >
                Simulate &lt; 2 Mins
              </button>
              <button
                onClick={resetTimer}
                className="px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-xs font-mono text-zinc-300 transition-all active:scale-[0.98]"
              >
                Reset to 10:00
              </button>
            </div>
          </div>

          {/* Interactive Widget 2: Dynamic Proposal Recalculator */}
          <div className="p-6 sm:p-8 rounded-2xl border border-zinc-800 bg-[#121215] flex flex-col justify-between space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400">
                  WIDGET 02 // PROPOSALS &amp; BILLING
                </span>
                <span className="text-xs font-mono text-zinc-400">Proposal #PR-2026</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">Real-Time Proposal &amp; 50% Deposit</h3>
              <p className="text-xs text-zinc-400">
                Toggle production add-ons. Subtotals and 50% milestone deposits update immediately with zero page reload.
              </p>
            </div>

            {/* Add-ons List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs">
                <span className="text-zinc-300 font-medium">Base Package: Cinematic Brand Story</span>
                <span className="font-mono font-bold text-white tabular-nums">${basePackagePrice.toLocaleString()}</span>
              </div>

              {addOns.map((addOn) => (
                <button
                  key={addOn.id}
                  onClick={() => toggleAddOn(addOn.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-xs transition-all active:scale-[0.99] text-left ${
                    addOn.selected
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                      : "bg-[#16161b] border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {addOn.selected ? (
                      <CheckSquare className="size-4 text-amber-400" />
                    ) : (
                      <Square className="size-4 text-zinc-500" />
                    )}
                    <span>{addOn.name}</span>
                  </div>
                  <span className="font-mono font-bold tabular-nums">+${addOn.price}</span>
                </button>
              ))}
            </div>

            {/* Recalculated Summary Card */}
            <div className="p-4 rounded-xl border border-zinc-800 bg-[#09090b] grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] font-mono uppercase text-zinc-400">Subtotal</span>
                <div className="font-mono text-base sm:text-lg font-bold text-white tabular-nums">
                  ${subtotal.toLocaleString()}
                </div>
              </div>

              <div className="border-x border-zinc-800 px-2">
                <span className="text-[10px] font-mono uppercase text-amber-400">50% Retainer</span>
                <div className="font-mono text-base sm:text-lg font-bold text-amber-400 tabular-nums">
                  ${deposit50.toLocaleString()}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase text-zinc-400">50% Paywall</span>
                <div className="font-mono text-base sm:text-lg font-bold text-zinc-300 tabular-nums">
                  ${balance50.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
