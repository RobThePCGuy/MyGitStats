import { useState, useEffect } from "react";
import { fetchIndex, fetchContributions } from "../lib/api.js";
import type { DashboardIndex, ContributionsData } from "../lib/types.js";
import { SummaryCard } from "../components/SummaryCard.js";
import { Loading } from "../components/Loading.js";

export function Overview() {
  const [data, setData] = useState<DashboardIndex | null>(null);
  const [contrib, setContrib] = useState<ContributionsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIndex()
      .then(setData)
      .catch((err) => setError(err.message));
    fetchContributions()
      .then(setContrib)
      .catch(() => setContrib({ days: [] }));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <Loading />;

  const { totals, repos } = data;
  const sorted = [...repos].sort((a, b) => b.stars - a.stars);

  const hasContributions = contrib && contrib.days.length > 0;
  const totalContributions = hasContributions
    ? contrib.days.reduce((sum, d) => sum + d.count, 0)
    : 0;

  return (
    <div>
      <h1 className="page-heading">Overview</h1>

      <div className="summary-cards">
        <SummaryCard label="Total Repos" value={totals.repos} />
        <SummaryCard label="Total Stars" value={totals.stars} />
        <SummaryCard label="Total Forks" value={totals.forks} />
        <SummaryCard label="Views This Week" value={totals.views} />
        <SummaryCard label="Clones This Week" value={totals.clones} />
      </div>

      <h2 className="section-heading">Contributions</h2>
      {hasContributions ? (
        <p style={{ color: "var(--color-text-secondary)" }}>
          {totalContributions.toLocaleString()} contributions over the last{" "}
          {contrib.days.length} days
        </p>
      ) : (
        <div className="empty-state">
          Contributions data not available. This feature requires PAT auth mode.
        </div>
      )}

      <h2 className="section-heading">Repositories</h2>
      {sorted.length === 0 ? (
        <div className="empty-state">No repositories found.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Repository</th>
              <th className="numeric">Stars</th>
              <th className="numeric">Forks</th>
              <th className="numeric">Views/Week</th>
              <th className="numeric">Clones/Week</th>
              <th className="numeric">Stars Gained</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((repo) => (
              <tr key={repo.id}>
                <td>
                  <a href={`#/repo/${repo.fullName}`}>{repo.fullName}</a>
                </td>
                <td className="numeric">{repo.stars.toLocaleString()}</td>
                <td className="numeric">{repo.forks.toLocaleString()}</td>
                <td className="numeric">{repo.viewsThisWeek.toLocaleString()}</td>
                <td className="numeric">{repo.clonesThisWeek.toLocaleString()}</td>
                <td className="numeric">
                  {repo.starsGainedThisWeek >= 0 ? "+" : ""}
                  {repo.starsGainedThisWeek}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
