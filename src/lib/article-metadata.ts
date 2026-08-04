import type { Metadata } from "next";
import type { Article } from "./types";
import { stripLeadingH1 } from "./strip-leading-h1";

const SITE_NAME = "Sandbox Daily";
const FALLBACK_URL = "https://sandbox-daily.vercel.app";
const MAX_DESCRIPTION_LENGTH = 160;

export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_URL;
  return url.replace(/\/+$/, "");
}

function articlePath(article: Article): string {
  return `/${article.category}/${article.slug}`;
}

/** Frontmatter `date: 2026-04-10` arrives as a Date (unquoted YAML), quoted as a string. */
function toIsoDate(value: string | Date): string {
  return new Date(value).toISOString();
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/^>\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max - 1).trimEnd()}…`;
}

export function articleDescription(article: Article): string {
  if (article.standfirst) return truncateAtWord(article.standfirst.trim(), 300);

  const paragraphs = stripLeadingH1(article.content)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !/^(-{3,}|#{1,6}\s)/.test(block));

  const first = paragraphs[0] ? stripMarkdownInline(paragraphs[0]) : "";
  return truncateAtWord(first || article.title, MAX_DESCRIPTION_LENGTH);
}

export function buildArticleMetadata(article: Article): Metadata {
  const description = articleDescription(article);
  const path = articlePath(article);
  const images = article.heroImage ? [article.heroImage] : undefined;

  return {
    title: `${article.title} — ${SITE_NAME}`,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: article.title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: "en_GB",
      publishedTime: toIsoDate(article.date),
      ...(article.editedAt ? { modifiedTime: article.editedAt } : {}),
      ...(article.tags.length ? { tags: article.tags } : {}),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: article.title,
      description,
      ...(images ? { images } : {}),
    },
  };
}

export interface ArticleJsonLd {
  "@context": "https://schema.org";
  "@type": "NewsArticle";
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  mainEntityOfPage: string;
  url: string;
  image?: string[];
  keywords?: string[];
  articleSection: string;
  publisher: {
    "@type": "Organization";
    name: string;
    url: string;
  };
}

export function buildArticleJsonLd(article: Article): ArticleJsonLd {
  const base = siteUrl();
  const url = `${base}${articlePath(article)}`;

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: articleDescription(article),
    datePublished: toIsoDate(article.date),
    ...(article.editedAt ? { dateModified: article.editedAt } : {}),
    mainEntityOfPage: url,
    url,
    ...(article.heroImage ? { image: [`${base}${article.heroImage}`] } : {}),
    ...(article.tags.length ? { keywords: article.tags } : {}),
    articleSection: article.category,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: base,
    },
  };
}

/** Escape `<` so embedded content can never close the ld+json script tag. */
export function serializeJsonLd(value: object): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
