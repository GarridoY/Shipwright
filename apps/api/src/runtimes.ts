import type { RuntimeCatalog } from './app.js';

/** Initial no-optional-capabilities runtime entry; replace with registered adapters as they are implemented. */
export const runtimeCatalog: RuntimeCatalog = {
  list: () => [{ id: 'fake', capabilities: [] }],
  get: (id) => id === 'fake' ? { id: 'fake', capabilities: [] } : undefined,
};
