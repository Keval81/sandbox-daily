import type { Article, Vertical } from "@/lib/types";

/** Verticals whose stories may lead the front page with no opt-in. */
export const LEAD_VERTICALS: readonly Vertical[] = ["news", "features"];

/**
 * Whether a story may take the front-page lead slot.
 *
 * The paper leads on news or a feature. Sport and tech reach the front page as
 * briefs beneath the lead — unless the operator ticks "lead the front page"
 * while approving, which writes `homepage_lead: true` into the frontmatter.
 *
 * Eligibility is not selection: the flag lets a story compete, and recency
 * still decides. See selectHomepage.
 */
export function isLeadEligible(article: Article): boolean {
  return LEAD_VERTICALS.includes(article.category) || article.homepageLead === true;
}

/**
 * Whether the review surface should offer the lead checkbox for this vertical.
 *
 * News and features are eligible already, so a checkbox there is a control
 * that changes nothing while implying it does.
 */
export function canPromoteToLead(vertical: Vertical): boolean {
  return !LEAD_VERTICALS.includes(vertical);
}
