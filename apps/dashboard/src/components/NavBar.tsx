import { useState, useEffect } from "react";

export function NavBar() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const isActive = (path: string) => {
    if (path === "#/") {
      return hash === "" || hash === "#" || hash === "#/";
    }
    return hash.startsWith(path);
  };

  return (
    <aside className="navbar">
      <h1>MyGitStats</h1>
      <nav>
        <a href="#/" className={isActive("#/") ? "active" : ""}>
          Overview
        </a>
        <a href="#/referrers" className={isActive("#/referrers") ? "active" : ""}>
          Referrers
        </a>
      </nav>
    </aside>
  );
}
