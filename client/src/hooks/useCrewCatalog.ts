import { useContext } from 'react';
import { CrewCatalogContext } from '../context/CrewCatalogContext';

export function useCrewCatalog() {
  const context = useContext(CrewCatalogContext);
  if (context === undefined) {
    throw new Error('useCrewCatalog must be used within a CrewCatalogProvider');
  }
  return context;
}
