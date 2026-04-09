import { Outlet } from 'react-router-dom';
import { RightRailProvider } from '../../contexts/RightRailContext';
import { RightPanel } from './RightPanel';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  return (
    <RightRailProvider>
      <div className="app-shell mx-auto min-h-screen max-w-[1720px] px-4 py-6 sm:px-6 xl:px-6 2xl:px-8">
        <div className="flex gap-4 xl:gap-5 2xl:gap-6">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <Topbar />
            <main>
              <Outlet />
            </main>
          </div>
          <RightPanel />
        </div>
      </div>
    </RightRailProvider>
  );
}
