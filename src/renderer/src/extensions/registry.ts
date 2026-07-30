import type { ProductExtension } from './types';
import { productionExtension } from './production';

const extensions = new Map<string, ProductExtension>([
  [productionExtension.id, productionExtension],
]);

export function getProductExtension(extensionId: string): ProductExtension {
  const extension = extensions.get(extensionId);
  if (!extension) throw new Error(`Unknown product extension: ${extensionId}`);
  return extension;
}
