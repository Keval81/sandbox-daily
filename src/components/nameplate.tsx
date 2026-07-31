/**
 * Broadsheet nameplate: centred display wordmark + mono edition stamp +
 * double rule beneath (the print-masthead convention). Server component —
 * nothing here is time-dependent per render frame (edition is derived
 * upstream from the same clock the folio row ticks), so it never needs to
 * be a client component.
 *
 * The wordmark markup/classes (`night-hero-masthead`, italic orange `em`)
 * are copied verbatim from HeroFrontPage's current masthead
 * (hero-front-page.tsx) rather than duplicated with new class names — Task
 * 4 removes that masthead from the split hero once this nameplate is wired
 * in; until then both render the identical wordmark independently.
 */
export function Nameplate({ edition }: { edition: number }) {
  return (
    <div className="nameplate">
      <h1 className="night-hero-masthead">
        Sandbox <em>Daily</em>
      </h1>
      <p className="nameplate-stamp font-mono">
        № {edition} · PRINTED NIGHTLY · THE PLANET, FACT-CHECKED
      </p>
    </div>
  );
}
