/**
 * A thin amber strip at the very top of every page on the staging copy, so it is never
 * mistaken for the live site. It sits in the page flow (not fixed), so it never covers the
 * sticky headers below it; it scrolls away like the rest of the page.
 */
export function StagingBar() {
  return (
    <div
      role="note"
      className="h-6 shrink-0 w-full bg-amber-500 text-black text-[11px] font-semibold leading-6 px-4 text-center truncate print:hidden"
    >
      Staging — test copy. Changes here don&apos;t affect the live site.
    </div>
  );
}
