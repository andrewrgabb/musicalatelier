/** The shell around every signed-in page: header, nav, and the routed content. */
import { NavLink, Outlet } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";

export function AppLayout() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">🎼 Musical Atelier</div>
        <nav>
          <NavLink to="/" end>
            Upload
          </NavLink>
          <NavLink to="/scores">My scores</NavLink>
        </nav>
        <div className="who">
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
