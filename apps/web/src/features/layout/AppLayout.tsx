/** The shell around every signed-in page: header, nav, and the routed content. */
import { NavLink, Outlet } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { Music4 } from "lucide-react";
import { cn } from "@/lib/utils";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-secondary text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        )
      }
    >
      {label}
    </NavLink>
  );
}

export function AppLayout() {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-6 px-6">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <Music4 className="size-5" />
            <span>Musical Atelier</span>
          </div>
          <nav className="flex flex-1 items-center gap-1">
            <NavItem to="/" label="Upload" />
            <NavItem to="/scores" label="My scores" />
          </nav>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
