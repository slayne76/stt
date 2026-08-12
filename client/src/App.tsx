import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import { CrewCatalogProvider } from './context/CrewCatalogContext';
import AppLayout from './layout/AppLayout';
import { ROUTES } from './routes';

function App() {
  return (
    <PlayerDataProvider>
      <CrewCatalogProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              {ROUTES.map(({ path, element }) => (
                <Route key={path} path={path} element={element} />
              ))}
            </Route>
          </Routes>
        </BrowserRouter>
      </CrewCatalogProvider>
    </PlayerDataProvider>
  );
}

export default App;
