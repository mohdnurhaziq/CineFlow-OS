import type { ElementType } from "react";

interface SplitHeadingProps {
  as?: ElementType;
  text: string;
  /** Closing words shown in the accent colour, in italic. */
  accent?: string;
  className?: string;
}

/**
 * A big headline whose words rise in one by one (see LandingMotion). The full headline is the element's
 * accessible name; the split words are hidden from screen readers. Without JavaScript every word is
 * simply visible.
 */
export function SplitHeading({ as: Tag = "h2", text, accent, className = "" }: SplitHeadingProps) {
  const words = (value: string, extra = "") =>
    value.split(" ").filter(Boolean).map((word, i) => (
      <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom pb-[0.14em] -mb-[0.14em]">
        <span className={`w inline-block ${extra}`}>{word}&nbsp;</span>
      </span>
    ));
  return (
    <Tag aria-label={accent ? `${text} ${accent}` : text} data-split className={`font-[family-name:var(--font-display)] font-normal tracking-tight leading-[1.02] text-white ${className}`}>
      <span aria-hidden="true">
        {words(text)}
        {accent && words(accent, "italic text-amber-400")}
      </span>
    </Tag>
  );
}
