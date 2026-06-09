/** The shell around every signed-in page: header, nav, and the routed content. */
import { NavLink, Outlet } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { AUTH_MODE, useCurrentUser } from "../../lib/auth";

export function AppLayout() {
  const { user } = useCurrentUser();

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
          {AUTH_MODE === "clerk" ? (
            <UserButton afterSignOutUrl="/sign-in" />
          ) : (
            user?.email ?? "—"
          )}
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
