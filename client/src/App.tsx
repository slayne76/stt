import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import OverviewPage from './pages/OverviewPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<OverviewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
