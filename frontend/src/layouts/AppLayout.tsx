import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Avatar, Button } from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";
import { cx } from "../utils/cx";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/projects", label: "Projects" },
  { to: "/issues", label: "Issues" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      "rounded-md px-3 py-2 text-sm font-medium transition-colors",
      isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    );

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <NavLink to="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white" aria-hidden="true">
              ▲
            </span>
            ShipTrack
          </NavLink>

          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            <NavLink to="/profile" className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-100">
              <Avatar name={user?.name ?? ""} />
              <span className="max-w-[10rem] truncate">{user?.name}</span>
            </NavLink>
            <Button
              variant="secondary"
              loading={loggingOut}
              onClick={async () => {
                setLoggingOut(true);
                await logout();
              }}
            >
              Log out
            </Button>
          </div>

          <button
            type="button"
            className="ml-auto rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>

        {open && (
          <nav id="mobile-menu" aria-label="Mobile" className="space-y-1 border-t border-slate-200 px-4 py-3 md:hidden">
            {[...NAV, { to: "/profile", label: "Profile" }].map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass} onClick={() => setOpen(false)}>
                {n.label}
              </NavLink>
            ))}
            <button
              type="button"
              className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
              onClick={() => void logout()}
            >
              Log out
            </button>
          </nav>
        )}
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
