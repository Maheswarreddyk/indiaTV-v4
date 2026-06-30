import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar.js';
import { ToastContainer } from './ToastContainer.js';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <ToastContainer />
      <main className="flex-1 pt-16">
        <Outlet />
      </main>
    </div>
  );
}
