import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import { CrewCatalogProvider } from './context/CrewCatalogContext';
import AppLayout from './layout/AppLayout';
import OverviewPage from './pages/OverviewPage';
import FiveStarsCrewPage from './pages/FiveStarsCrewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
import FourFiveStarsCrewPage from './pages/FourFiveStarsCrewPage';
import FourFourStarsCrewReadyPage from './pages/FourFourStarsCrewReadyPage';
import FourFourStarsCrewPage from './pages/FourFourStarsCrewPage';
import CollectionsPage from './pages/CollectionsPage';
import FourStarsDuplicatesPage from './pages/FourStarsDuplicatesPage';
import FiveStarsDuplicatesPage from './pages/FiveStarsDuplicatesPage';
import FiveStarsShipsPage from './pages/FiveStarsShipsPage';
import FourStarsShipsPage from './pages/FourStarsShipsPage';
import QPsPage from './pages/QPsPage';
import FrozenCrewPage from './pages/FrozenCrewPage';

function App() {
  return (
    <PlayerDataProvider>
      <CrewCatalogProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/5-stars-crew" element={<FiveStarsCrewPage />} />
              <Route path="/3-4-stars-crew" element={<ThreeFourStarsCrewPage />} />
              <Route path="/4-5-stars-crew" element={<FourFiveStarsCrewPage />} />
              <Route path="/4-4-stars-crew-ready" element={<FourFourStarsCrewReadyPage />} />
              <Route path="/4-4-stars-crew" element={<FourFourStarsCrewPage />} />
              <Route path="/collections" element={<CollectionsPage />} />
              <Route path="/4-stars-duplicates" element={<FourStarsDuplicatesPage />} />
              <Route path="/5-stars-duplicates" element={<FiveStarsDuplicatesPage />} />
              <Route path="/5-stars-ships" element={<FiveStarsShipsPage />} />
              <Route path="/4-stars-ships" element={<FourStarsShipsPage />} />
              <Route path="/qps" element={<QPsPage />} />
              <Route path="/5-4-stars-frozen-crew" element={<FrozenCrewPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CrewCatalogProvider>
    </PlayerDataProvider>
  );
}

export default App;
