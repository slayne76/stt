import { useContext } from 'react';
import { ShipCatalogContext } from '../context/ShipCatalogContext';

export function useShipCatalog() {
  const context = useContext(ShipCatalogContext);
  if (context === undefined) {
    throw new Error('useShipCatalog must be used within a ShipCatalogProvider');
  }
  return context;
}
