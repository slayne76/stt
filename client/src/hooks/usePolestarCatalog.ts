import { useContext } from 'react';
import { PolestarCatalogContext } from '../context/PolestarCatalogContext';

export function usePolestarCatalog() {
  const context = useContext(PolestarCatalogContext);
  if (context === undefined) {
    throw new Error('usePolestarCatalog must be used within a PolestarCatalogProvider');
  }
  return context;
}
