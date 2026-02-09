import { useState, useEffect } from "react";
import { Layout } from "./components/Layout.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Overview } from "./pages/Overview.js";
import { RepoDetail } from "./pages/RepoDetail.js";
import { Referrers } from "./pages/Referrers.js";

function Router() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Parse the hash route
  const path = hash.replace(/^#/, "") || "/";

  // Match #/repo/:owner/:name
  const repoMatch = path.match(/^\/repo\/([^/]+)\/([^/]+)$/);
  if (repoMatch) {
    return <RepoDetail owner={repoMatch[1]} repo={repoMatch[2]} />;
  }

  // Match #/referrers
  if (path === "/referrers") {
    return <Referrers />;
  }

  // Default: overview
  return <Overview />;
}

export function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Router />
      </Layout>
    </ErrorBoundary>
  );
}
