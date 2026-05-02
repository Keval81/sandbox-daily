import type { InlineImage } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineFigure(img: InlineImage): string {
  const alt = escapeHtml(img.concept);
  const src = escapeHtml(img.path);
  // Inline styles override the article wrapper's `[&_img]:my-10`, `shadow-md`,
  // etc. — those would otherwise pull the absolute-positioned image out of
  // its aspect-ratio container.
  const imgStyle = [
    "position:absolute",
    "inset:0",
    "width:100%",
    "height:100%",
    "object-fit:cover",
    "margin:0",
    "max-width:100%",
    "border-radius:0",
    "box-shadow:none",
  ].join(";");
  const containerStyle = "aspect-ratio:16/9";
  return [
    '<figure class="my-10 -mx-4 md:-mx-8">',
    `<div class="relative w-full overflow-hidden rounded-sharp bg-ink" style="${containerStyle}">`,
    `<img src="${src}" alt="${alt}" loading="lazy" style="${imgStyle}" />`,
    "</div>",
    "</figure>",
  ].join("");
}

/**
 * Splices inline figures into rendered HTML at H2 boundaries.
 * Convention: image[0] goes after the 1st H2 section, image[1] after the 3rd.
 * If the article doesn't have enough H2s, falls back to later positions or
 * appends at the end so we never silently drop images.
 */
export function injectInlineImages(
  html: string,
  images: InlineImage[] | undefined
): string {
  if (!images || images.length === 0) return html;
  const segments = html.split(/(?=<h2)/);

  const inserts = new Map<number, InlineImage>();
  const targetSlots = [1, 3];
  let imgIdx = 0;
  for (const slot of targetSlots) {
    if (imgIdx >= images.length) break;
    if (slot < segments.length) {
      inserts.set(slot, images[imgIdx]!);
      imgIdx++;
    }
  }
  const trailing = images.slice(imgIdx);

  return (
    segments
      .map((seg, i) =>
        inserts.has(i) ? seg + renderInlineFigure(inserts.get(i)!) : seg
      )
      .join("") + trailing.map(renderInlineFigure).join("")
  );
}

/**
 * The big Tailwind class string we apply to the rendered article body. Kept
 * here so /features, /spotlights, /review/{slug} all share the exact same
 * prose styling — drift here = inconsistent reading experience.
 */
export const ARTICLE_PROSE_CLASS =
  "font-body text-body leading-reading text-ink max-w-reading [&>h1]:font-display [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:leading-headline [&>h1]:mt-12 [&>h1]:mb-4 [&>h2]:font-display [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:leading-headline [&>h2]:mt-12 [&>h2]:mb-4 [&>h3]:font-display [&>h3]:text-xl [&>h3]:font-bold [&>h3]:leading-headline [&>h3]:mt-8 [&>h3]:mb-3 [&>p]:mb-6 [&>blockquote]:border-l-4 [&>blockquote]:border-l-ink [&>blockquote]:pl-6 [&>blockquote]:italic [&>blockquote]:font-display [&>blockquote]:text-xl [&>blockquote]:my-8 [&>strong]:font-semibold [&>hr]:border-grey/30 [&>hr]:my-8 [&>p:first-of-type]:first-letter:text-6xl [&>p:first-of-type]:first-letter:font-display [&>p:first-of-type]:first-letter:font-black [&>p:first-of-type]:first-letter:float-left [&>p:first-of-type]:first-letter:mr-3 [&>p:first-of-type]:first-letter:mt-1 [&>p:first-of-type]:first-letter:leading-none [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-sm [&_img]:my-10 [&_img]:shadow-md";
