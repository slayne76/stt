import { useContext } from 'react';
import { PlayerDataContext } from '../context/PlayerDataContext';

export function usePlayerData() {
  const context = useContext(PlayerDataContext);
  if (context === undefined) {
    throw new Error('usePlayerData must be used within a PlayerDataProvider');
  }
  return context;
}
