import { Marked, Renderer } from 'marked';

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function referenceHeadingId(text: string): string {
  return text.replace(/[`*_]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-');
}

/** 同梱Markdown専用。HTML・画像は実行せず、リンクを文書内またはhttp(s)に限定する。 */
export function renderReferenceMarkdown(source: string): string {
  const headings = new Map<string, number>();
  const renderer = new Renderer();
  renderer.html = ({ text }) => escape(text);
  renderer.image = ({ text }) => escape(text);
  renderer.heading = function ({ tokens, text, depth }) {
    const slug = referenceHeadingId(text), count = headings.get(slug) ?? 0;
    headings.set(slug, count + 1);
    const id = `reference-${slug}${count ? `-${count}` : ''}`;
    return `<h${depth} id="${escape(id)}" tabindex="-1">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  };
  renderer.link = function ({ href, tokens }) {
    const label = this.parser.parseInline(tokens);
    if (href.startsWith('#')) {
      try { return `<a href="#reference-${escape(decodeURIComponent(href.slice(1)))}">${label}</a>`; }
      catch { return label; }
    }
    if (!/^https?:\/\//i.test(href)) return label;
    return `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  };
  renderer.table = function (token) {
    return `<div class="reference-table">${Renderer.prototype.table.call(this, token)}</div>`;
  };
  return new Marked({ renderer, gfm: true }).parse(source, { async: false });
}
