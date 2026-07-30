import type { ProductExtension } from '../types';
import { ProductionHome } from './ProductionHome';
import { ProductionWorkspace } from './ProductionWorkspace';
import './production.css';

export const productionExtension: ProductExtension = {
  id: 'production',
  Home: ProductionHome,
  Workspace: ProductionWorkspace,
};
