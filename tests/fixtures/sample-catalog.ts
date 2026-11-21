import { readFileSync, readdirSync } from 'node:fs';
import { createTemplateCatalog } from '../../src/app/sample-catalog.ts';

/** Nodeテストは、ブラウザのglobと同じファイル集合を共通検証器へ渡す。 */
const root = new URL('../../samples/', import.meta.url);
export const sampleMetadata: unknown = JSON.parse(readFileSync(new URL('index.json', root), 'utf8'));
export const sampleDocuments: Record<string, unknown> = {};
function collect(directory: URL, prefix = ''): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) collect(new URL(`${entry.name}/`, directory), `${path}/`);
    else if (entry.name.endsWith('.json') && path !== 'index.json') sampleDocuments[path] = JSON.parse(readFileSync(new URL(entry.name, directory), 'utf8'));
  }
}
collect(root);
const catalog = createTemplateCatalog(sampleMetadata, sampleDocuments);
export const notebookTemplates = catalog.templates;
export const templateCategories = catalog.categories;
