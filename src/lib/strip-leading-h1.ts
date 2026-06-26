/**
 * Remove a single leading H1 (`# ...`) from the top of a markdown body.
 * The writer emits the title as the body's first heading, which the app also
 * renders as the page H1 from frontmatter — a duplicate. Stripping the leading
 * H1 at render kills it for every article. Only an H1 that is the first
 * non-empty line is removed; H2+ and bodies without a leading H1 are unchanged.
 */
export function stripLeadingH1(markdown: string): string {
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  if (i < lines.length && /^#\s+\S/.test(lines[i]!)) {
    lines.splice(0, i + 1);
    while (lines.length && lines[0]!.trim() === "") lines.shift();
    return lines.join("\n");
  }
  return markdown;
}
