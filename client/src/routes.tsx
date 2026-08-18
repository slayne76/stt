import type { ReactElement } from 'react';
import OverviewPage from './pages/OverviewPage';
import FiveStarsCrewPage from './pages/FiveStarsCrewPage';
import ThreeFiveStarsCrewPage from './pages/ThreeFiveStarsCrewPage';
import ThreeFourStarsCrewPage from './pages/ThreeFourStarsCrewPage';
import FourFiveStarsCrewPage from './pages/FourFiveStarsCrewPage';
import FourFourStarsCrewReadyPage from './pages/FourFourStarsCrewReadyPage';
import FourFourStarsCrewPage from './pages/FourFourStarsCrewPage';
import CollectionsPage from './pages/CollectionsPage';
import DuplicatesPage from './pages/DuplicatesPage';
import FiveStarsShipsPage from './pages/FiveStarsShipsPage';
import FourStarsShipsPage from './pages/FourStarsShipsPage';
import QPsPage from './pages/QPsPage';
import FrozenCrewPage from './pages/FrozenCrewPage';
import DilemmasPage from './pages/DilemmasPage';

export interface NavLink {
  label: string;
  path: string;
  element: ReactElement;
}

export interface NavGroup {
  label: string;
  children: NavLink[];
}

export function isNavGroup(item: NavLink | NavGroup): item is NavGroup {
  return 'children' in item;
}

export const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { label: 'Overview', path: '/', element: <OverviewPage /> },
  {
    label: 'Crew',
    children: [
      { label: '5 Stars Crew', path: '/5-stars-crew', element: <FiveStarsCrewPage /> },
      { label: '3/5 Stars Crew', path: '/3-5-stars-crew', element: <ThreeFiveStarsCrewPage /> },
      { label: '3/4 Stars crew', path: '/3-4-stars-crew', element: <ThreeFourStarsCrewPage /> },
      { label: '4/5 Stars crew', path: '/4-5-stars-crew', element: <FourFiveStarsCrewPage /> },
      { label: '4/4 Stars crew (ready)', path: '/4-4-stars-crew-ready', element: <FourFourStarsCrewReadyPage /> },
      { label: '4/4 Stars crew', path: '/4-4-stars-crew', element: <FourFourStarsCrewPage /> },
      { label: 'Duplicates', path: '/duplicates', element: <DuplicatesPage /> },
      { label: 'QPs', path: '/qps', element: <QPsPage /> },
      { label: '5 & 4 Stars Frozen Crew', path: '/5-4-stars-frozen-crew', element: <FrozenCrewPage /> },
    ],
  },
  {
    label: 'Ships',
    children: [
      { label: '5 Stars Ships', path: '/5-stars-ships', element: <FiveStarsShipsPage /> },
      { label: '4 Stars Ships', path: '/4-stars-ships', element: <FourStarsShipsPage /> },
    ],
  },
  { label: 'Collections', path: '/collections', element: <CollectionsPage /> },
  { label: 'Dilemmas', path: '/dilemmas', element: <DilemmasPage /> },
];

function flattenRoutes(items: (NavLink | NavGroup)[]): NavLink[] {
  return items.flatMap((item) => (isNavGroup(item) ? item.children : [item]));
}

export const ROUTES: NavLink[] = flattenRoutes(NAV_ITEMS);
