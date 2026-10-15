import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import type { AdminContentEditorIslandKey } from './admin-content-editor-registry';

export type AdminContentEditorIslandComponent = AstroComponentFactory;

export const loadAdminContentEditorIsland = async (
  island: AdminContentEditorIslandKey
): Promise<AdminContentEditorIslandComponent> => {
  switch (island) {
    case 'blog':
    case 'projects':
    case 'devlog':
      return (await import('./editor/blog/BlogEditorIsland.astro')).default;
    case 'bits':
      return (await import('./editor/bits/BitsEditorIsland.astro')).default;
    case 'about':
      return (await import('./editor/fixed-page/AboutEditorIsland.astro')).default;
    default: {
      const exhaustive: never = island;
      throw new Error(`Unsupported admin content editor island: ${exhaustive}`);
    }
  }
};
