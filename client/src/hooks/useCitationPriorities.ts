import { useContext } from 'react';
import { CitationPrioritiesContext } from '../context/CitationPrioritiesContext';

export function useCitationPriorities() {
  const context = useContext(CitationPrioritiesContext);
  if (context === undefined) {
    throw new Error('useCitationPriorities must be used within a CitationPrioritiesProvider');
  }
  return context;
}
