import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Lexer } from 'marked';
import type { Tokens } from 'marked';
import { functionNames } from '../src/language/builtins.ts';
import { calculate } from '../src/workbook.ts';
import { renderReferenceMarkdown, referenceHeadingId } from '../src/ui/documentation/markdown.ts';

const reference = readFileSync(new URL('../docs/reference.md', import.meta.url), 'utf8');

test('機能リファレンスは全関数・別名と主要な画面機能を説明し、目次の行先を持つ', () => {
  for (const name of functionNames) assert.match(reference, new RegExp('`'+name+'(?:\\(|`)'), name);
  for (const name of ['undo','redo','JSON','URL','コメント','Enter','OGF','EGF','TeX','変数名','ドキュメント','上限']) assert.ok(reference.includes(name), name);
  const tokens = Lexer.lex(reference);
  const ids = new Set(tokens.filter((token): token is Tokens.Heading => token.type === 'heading').map(token => referenceHeadingId(token.text)));
  for (const match of reference.matchAll(/\]\(#([^)]+)\)/g)) assert.ok(ids.has(match[1]!), `missing: ${match[1]}`);
  const html = renderReferenceMarkdown(reference);
  assert.match(html, /<table>/); assert.match(html, /<pre><code/); assert.match(html, /id="reference-fps"/);
  assert.match(html, /href="#reference-fpsを作る"/);
});

test('リファレンスの独立した計算例は現在の構文・定義域で評価できる', () => {
  let count = 0;
  for (const item of Lexer.lex(reference)) {
    if (item.type !== 'code') continue;
    const token = item as Tokens.Code;
    if (!/^fps(?:-mod\d+|-error)?$/.test(token.lang ?? '')) continue;
    const sources = token.text.split('\n').map(source => source.trim()).filter(Boolean);
    const modulus = /^fps-mod(\d+)$/.exec(token.lang!)?.[1];
    const result = calculate({ rows: sources.map((source, i) => ({ id: String(i), source })), terms: 8, domain: modulus ? 'prime' : 'rational', modulus: modulus ?? '998244353', basis: 'ogf' });
    assert.equal(result.error, undefined, token.text);
    for (const [i, row] of result.rows.entries()) {
      if (token.lang === 'fps-error') assert.ok(row.error, sources[i]!);
      else assert.equal(row.error, undefined, `${sources[i]}: ${row.error}`);
    }
    count++;
  }
  assert.ok(count >= 20);
});

test('Markdownの生HTML・画像・危険なリンクを実行せず、文書内とhttp(s)のリンクだけ表示する', () => {
  const html = renderReferenceMarkdown('<script>window.bad=1</script>\n\n<img src=x onerror="bad()">\n\n[x](javascript:alert%281%29)\n\n![image](https://example.test/pixel)\n\n[x](data:text/html,bad)\n\n[local](#fps) [external](https://example.test/)');
  assert.doesNotMatch(html, /<script|<img|href="javascript:|href="data:/i);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /href="#reference-fps"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(renderReferenceMarkdown('[bad](#%zz)'), /href=/);
  const headings = renderReferenceMarkdown('# Title\n\n# Title');
  assert.match(headings, /id="reference-title"/); assert.match(headings, /id="reference-title-1"/);
});
