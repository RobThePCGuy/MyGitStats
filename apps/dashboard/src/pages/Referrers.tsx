import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchReferrers } from "../lib/api.js";
import type { ReferrersData } from "../lib/types.js";
import { Loading } from "../components/Loading.js";

export function Referrers() {
  const [data, setData] = useState<ReferrersData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReferrers()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <Loading />;

  const repoEntries = Object.entries(data.repos).filter(
    ([, info]) => info.referrers.length > 0 || info.paths.length > 0,
  );

  if (repoEntries.length === 0) {
    return (
      <div>
        <h1 className="page-heading">Referrers</h1>
        <div className="empty-state">No referrer data available.</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-heading">Referrers</h1>

      {repoEntries.map(([repoName, info]) => (
        <div key={repoName}>
          <h2 className="section-heading">{repoName}</h2>

          {info.referrers.length > 0 && (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Referrer</th>
                    <th className="numeric">Count</th>
                    <th className="numeric">Uniques</th>
                  </tr>
                </thead>
                <tbody>
                  {info.referrers.map((r) => (
                    <tr key={r.referrer}>
                      <td>{r.referrer}</td>
                      <td className="numeric">{r.count}</td>
                      <td className="numeric">{r.uniques}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="chart-container">
                <ResponsiveContainer width="100%" height={Math.max(150, info.referrers.length * 35)}>
                  <BarChart
                    data={info.referrers}
                    layout="vertical"
                    margin={{ left: 100, right: 20, top: 5, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                    <XAxis type="number" stroke="#8b949e" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="referrer"
                      stroke="#8b949e"
                      tick={{ fontSize: 12 }}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#161b22",
                        border: "1px solid #30363d",
                        borderRadius: 6,
                        color: "#e6edf3",
                      }}
                    />
                    <Bar dataKey="count" fill="#58a6ff" name="Count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {info.paths.length > 0 && (
            <>
              <h3 className="section-heading">Popular Paths</h3>
              <table>
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>Title</th>
                    <th className="numeric">Count</th>
                    <th className="numeric">Uniques</th>
                  </tr>
                </thead>
                <tbody>
                  {info.paths.map((p) => (
                    <tr key={p.path}>
                      <td>{p.path}</td>
                      <td>{p.title}</td>
                      <td className="numeric">{p.count}</td>
                      <td className="numeric">{p.uniques}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ))}

      <p className="caveat">
        GitHub provides referrer and path data for a rolling 14-day window only.
      </p>
    </div>
  );
}
