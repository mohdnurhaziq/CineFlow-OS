export interface ReviewDetails {
  name: string;
  address: string;
  discipline: string;
  tagline: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  google: boolean;
}

/** The sign-up wizard's last step: everything the person entered, each part with a way back to it. */
export function ReviewSummary({ details, onChange }: { details: ReviewDetails; onChange: (step: number) => void }) {
  const groups: { step: number; title: string; rows: [string, string][] }[] = [
    {
      step: 1,
      title: "Your studio",
      rows: [
        ["Studio name", details.name],
        ["Web address", details.address],
        ["Type", details.discipline],
      ],
    },
    { step: 2, title: "Your look", rows: [["Tagline", details.tagline.trim() || "None"]] },
    {
      step: 3,
      title: "Your sign-in",
      rows: [
        ["Your name", details.ownerName],
        ["Email", details.ownerEmail],
        ["Sign in with", details.google ? "Google" : "The password you chose"],
        ["Mobile", details.ownerPhone.trim() || "None"],
      ],
    },
  ];
  return (
    <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-[#0d0d10]">
      {groups.map((group) => (
        <section key={group.step} aria-label={group.title} className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">{group.title}</h3>
            <button
              type="button"
              onClick={() => onChange(group.step)}
              aria-label={`Change ${group.title.toLowerCase()}`}
              className="-my-2 inline-flex min-h-11 items-center px-2 text-xs font-medium text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              Change
            </button>
          </div>
          <dl className="mt-2 space-y-1.5">
            {group.rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[7rem_1fr] gap-3 text-xs">
                <dt className="text-zinc-400">{label}</dt>
                <dd className="min-w-0 break-words text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
