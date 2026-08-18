import { useContext } from 'react';
import { DilemmasContext } from '../context/DilemmasContext';

export function useDilemmas() {
  const context = useContext(DilemmasContext);
  if (context === undefined) {
    throw new Error('useDilemmas must be used within a DilemmasProvider');
  }
  return context;
}
