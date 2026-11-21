import { createTemplateCatalog } from './sample-catalog.ts';

/** ViteがJSONを静的に収集する入口。配信サブパスによらず、同じデータをアプリへ同梱する。 */
const prefix = '../../samples/';
const modules = import.meta.glob<unknown>('../../samples/**/*.json', { eager: true, import: 'default' });
const documents = Object.fromEntries(Object.entries(modules)
  .filter(([path]) => path !== `${prefix}index.json`)
  .map(([path, document]) => [path.slice(prefix.length), document]));
const catalog = createTemplateCatalog(modules[`${prefix}index.json`], documents);
export const notebookTemplates = catalog.templates;
export const templateCategories = catalog.categories;
