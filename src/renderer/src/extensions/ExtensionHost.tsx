import { getProductExtension } from './registry';
import type { ProductHomeContext, ProductWorkspaceContext } from './types';

type ExtensionHostProps = {
  extensionId: string;
} & (
  | { surface: 'home'; context: ProductHomeContext }
  | { surface: 'workspace'; context: ProductWorkspaceContext }
);

export function ExtensionHost(props: ExtensionHostProps) {
  const extension = getProductExtension(props.extensionId);
  if (props.surface === 'home') return <extension.Home {...props.context} />;
  return <extension.Workspace {...props.context} />;
}
