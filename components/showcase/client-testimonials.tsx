import { Star, Quote } from "lucide-react";

interface ClientTestimonialsProps {
  tenant: {
    name: string;
  };
}

const TESTIMONIALS = [
  {
    quote:
      "The 10-minute slot hold gave us complete peace of mind during the intense graduation booking rush. The delivery vault and uncompressed master downloads were impeccable.",
    client: "Dr. Aiman Farhan",
    campaign: "University Convocation Special",
    rating: 5,
  },
  {
    quote:
      "From on-set solar call sheets to dynamic proposal signing, CineFlow OS streamlined our entire brand commercial shoot. Best production workflow we've ever experienced.",
    client: "Sarah Jenkins",
    campaign: "Autumn Editorial Brand Campaign",
    rating: 5,
  },
  {
    quote:
      "Capturing our family's Syawal homecoming was effortless. The wall visualizer helped us pick the exact 16R walnut frame for our living room.",
    client: "Datin Zubaidah & Family",
    campaign: "Hari Raya Festive Heirloom",
    rating: 5,
  },
];

export function ClientTestimonials({ tenant }: ClientTestimonialsProps) {
  return (
    <section className="space-y-8">
      <div className="space-y-2 text-center max-w-2xl mx-auto">
        <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Client Endorsements &amp; Production Reviews
        </h3>
        <p className="text-xs sm:text-sm text-zinc-400">
          Reflections from commercial brands, graduating scholars, and heirloom portrait families.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TESTIMONIALS.map((t, idx) => (
          <div
            key={idx}
            className="p-6 rounded-2xl border border-zinc-800 bg-[#121215] flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-1 text-amber-400">
                {[...Array(t.rating)].map((_, i) => (
                  <Star key={i} className="size-3.5 fill-amber-400" />
                ))}
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed italic">
                &ldquo;{t.quote}&rdquo;
              </p>
            </div>

            <div className="pt-3 border-t border-zinc-800/80">
              <div className="text-xs font-bold text-white">{t.client}</div>
              <div className="text-[10px] font-mono text-zinc-400">{t.campaign}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
