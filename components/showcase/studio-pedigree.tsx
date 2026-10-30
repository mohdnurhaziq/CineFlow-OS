import { Camera, Film, Sun, Sparkles } from "lucide-react";

interface StudioPedigreeProps {
  tenant: {
    discipline: string;
    brandColor?: string | null;
  };
}

export function StudioPedigree({ tenant }: StudioPedigreeProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#121215] p-8 sm:p-10 space-y-8">
      <div className="space-y-2 text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-400">
          <Sparkles className="size-3.5 text-amber-400" />
          <span>PRODUCTION PEDIGREE &amp; STANDARDS</span>
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Engineered With Feature-Film Optics &amp; Precision
        </h3>
        <p className="text-xs sm:text-sm text-zinc-400">
          We shoot exclusively on industry-standard cameras, master cinema glass, and calibrated color workflows.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-5 rounded-xl border border-zinc-800/80 bg-[#15151a] space-y-3">
          <div className="size-10 rounded-lg bg-zinc-900 flex items-center justify-center text-amber-400 border border-zinc-800">
            <Camera className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Camera Systems</h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              ARRI ALEXA Mini LF, RED V-Raptor 8K, Hasselblad H6D-100c medium format.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-zinc-800/80 bg-[#15151a] space-y-3">
          <div className="size-10 rounded-lg bg-zinc-900 flex items-center justify-center text-cyan-400 border border-zinc-800">
            <Film className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Master Optics</h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Cooke Anamorphic /i Full Frame Plus, Leica Summilux-C primes, Hasselblad HC glass.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-zinc-800/80 bg-[#15151a] space-y-3">
          <div className="size-10 rounded-lg bg-zinc-900 flex items-center justify-center text-emerald-400 border border-zinc-800">
            <Sun className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Light &amp; Color Science</h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Aputure Electro Storm, Broncolor Siros 800S, calibrated DaVinci Resolve color grading.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
