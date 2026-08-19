import { useContext } from 'react';
import { RetrievableCrewContext } from '../context/RetrievableCrewContext';

export function useRetrievableCrew() {
  const context = useContext(RetrievableCrewContext);
  if (context === undefined) {
    throw new Error('useRetrievableCrew must be used within a RetrievableCrewProvider');
  }
  return context;
}
