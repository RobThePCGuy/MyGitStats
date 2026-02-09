import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { fetchRepo } from "../lib/api.js";
import type { RepoTimeSeries } from "../lib/types.js";
import { SummaryCard } from "../components/SummaryCard.js";
import { Loading } from "../components/Loading.js";

export function RepoDetail({ owner, repo }: { owner: string; repo: string }) {
  const [data, setData] = useState<RepoTimeSeries | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetchRepo(owner, repo)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [owner, repo]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <Loading />;

  const { fullName, days, weekOverWeek } = data;

  return (
    <div>
      <a href="#/" className="back-link">
        &larr; Back to Overview
      </a>
      <h1 className="page-heading">{fullName}</h1>

      <div className="summary-cards">
        <SummaryCard
          label="Views (this week)"
          value={weekOverWeek.views.current}
          delta={weekOverWeek.views.change}
        />
        <SummaryCard
          label="Clones (this week)"
          value={weekOverWeek.clones.current}
          delta={weekOverWeek.clones.change}
        />
        <SummaryCard
          label="Stars (this week)"
          value={weekOverWeek.stars.current}
          delta={weekOverWeek.stars.change}
        />
      </div>

      {days.length === 0 ? (
        <div className="empty-state">No data points available.</div>
      ) : (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={days}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis
                dataKey="date"
                stroke="#8b949e"
                tick={{ fontSize: 12 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                yAxisId="left"
                stroke="#8b949e"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#8b949e"
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  background: "#161b22",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  color: "#e6edf3",
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="views"
                stroke="#58a6ff"
                dot={false}
                name="Views"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="clones"
                stroke="#3fb950"
                dot={false}
                name="Clones"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="stars"
                stroke="#d2a8ff"
                dot={false}
                name="Stars"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
