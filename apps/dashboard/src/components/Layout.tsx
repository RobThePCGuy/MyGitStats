import { NavBar } from "./NavBar.js";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <NavBar />
      <main className="main-content">{children}</main>
    </div>
  );
}
