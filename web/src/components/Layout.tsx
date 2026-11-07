import { NavLink, Outlet } from "react-router";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-teal-800 text-white" : "text-teal-50 hover:bg-teal-600"}`;

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-teal-700 text-white shadow">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-white text-teal-700">
              ⚠
            </span>
            Infra
          </NavLink>
          <nav className="flex gap-1" aria-label="Main">
            <NavLink to="/" end className={navClass}>
              Report
            </NavLink>
            <NavLink to="/map" className={navClass}>
              Map
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        GullHacks 2026 demo · AI analysis by Gemini · Map data © OpenStreetMap contributors
      </footer>
    </div>
  );
}
