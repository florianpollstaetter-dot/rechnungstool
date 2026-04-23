// SCH-600 Phase-5 #11 — sanitize any HTML we render via
// `dangerouslySetInnerHTML`, even when the source is admin-curated markdown
// we control. Defence-in-depth: if a future feature lets a lower-privileged
// user write into `company_documents.body` or `smart_insights.body`, the
// viewer still can't execute injected scripts.

import sanitizeHtmlLib, { type IOptions } from "sanitize-html";
import { marked } from "marked";

// Markdown-idiomatic allow-list. Headings, lists, tables, inline formatting,
// code blocks, links (stripped of javascript:), images (stripped of
// javascript:). Disallows iframe / script / object / embed / style by
// default (sanitize-html's defaults).
const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "strong", "em", "b", "i", "u", "s", "del", "ins",
  "blockquote",
  "code", "pre", "kbd", "samp",
  "a",
  "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "span", "div",
];

const ALLOWED_ATTRIBUTES: IOptions["allowedAttributes"] = {
  a: ["href", "name", "target", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  "*": ["class"],
};

const SANITIZE_OPTS: IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  // Only http(s) and mailto URLs. `javascript:`, `data:`, etc. are dropped.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  // Force target=_blank + rel=noopener noreferrer on external links.
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),
  },
};

export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, SANITIZE_OPTS);
}

export function markdownToSafeHtml(md: string): string {
  const parsed = marked.parse(md, { async: false }) as string;
  return sanitizeHtml(parsed);
}
