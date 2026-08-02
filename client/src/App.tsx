import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerDataProvider } from './context/PlayerDataContext';
import AppLayout from './layout/AppLayout';
import OverviewPage from './pages/OverviewPage';

function App() {
  return (
    <PlayerDataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<OverviewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PlayerDataProvider>
  );
}

export default App;
