import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import { CrewCatalogProvider } from './context/CrewCatalogContext';
import { CitationPrioritiesProvider } from './context/CitationPrioritiesContext';
import { DilemmasProvider } from './context/DilemmasContext';
import { ShipCatalogProvider } from './context/ShipCatalogContext';
import { PolestarCatalogProvider } from './context/PolestarCatalogContext';
import AppLayout from './layout/AppLayout';
import { ROUTES } from './routes';

function App() {
  return (
    // CitationPrioritiesProvider is deliberately OUTERMOST, not nested with
    // the others. React fires child providers' mount effects before parent
    // providers' (child-before-parent), so whichever provider is innermost
    // issues its fetch first. Citation priorities' first fetch can occupy the
    // single-threaded server for ~12-13s (see computeCitationPriorities.ts) —
    // nesting it innermost would make /api/player and /api/catalog queue
    // behind that on every cold load, stalling the whole page instead of just
    // the two citation sections. Outermost means its fetch fires last.
    // DilemmasProvider/ShipCatalogProvider/PolestarCatalogProvider all fetch
    // small, cheap resources regardless of nesting position — they go
    // innermost, alongside CrewCatalogProvider.
    <CitationPrioritiesProvider>
      <PlayerDataProvider>
        <CrewCatalogProvider>
          <DilemmasProvider>
            <ShipCatalogProvider>
              <PolestarCatalogProvider>
                <BrowserRouter>
                  <Routes>
                    <Route element={<AppLayout />}>
                      {ROUTES.map(({ path, element }) => (
                        <Route key={path} path={path} element={element} />
                      ))}
                    </Route>
                  </Routes>
                </BrowserRouter>
              </PolestarCatalogProvider>
            </ShipCatalogProvider>
          </DilemmasProvider>
        </CrewCatalogProvider>
      </PlayerDataProvider>
    </CitationPrioritiesProvider>
  );
}

export default App;
