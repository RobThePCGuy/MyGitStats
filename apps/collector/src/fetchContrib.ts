import type { Octokit } from "octokit";
import type { ContributionDay } from "@mygitstats/shared";

interface ContribGraphQLResponse {
  viewer: {
    contributionsCollection: {
      contributionCalendar: {
        weeks: {
          contributionDays: {
            date: string;
            contributionCount: number;
          }[];
        }[];
      };
    };
  };
}

/**
 * Fetch the authenticated user's contribution calendar for a date range.
 * Uses the GraphQL contributionsCollection query.
 */
export async function fetchContributions(
  octokit: Octokit,
  from: string,
  to: string
): Promise<ContributionDay[]> {
  console.log(`[contrib] Fetching contributions from ${from} to ${to}`);

  const query = `
    query ($from: DateTime!, $to: DateTime!) {
      viewer {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await octokit.graphql<ContribGraphQLResponse>(query, {
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`,
    });

    const days: ContributionDay[] = [];
    for (const week of response.viewer.contributionsCollection.contributionCalendar.weeks) {
      for (const day of week.contributionDays) {
        days.push({
          date: day.date,
          count: day.contributionCount,
        });
      }
    }

    console.log(`[contrib] Got ${days.length} contribution days`);
    return days;
  } catch (err) {
    console.error(
      "[contrib] Failed to fetch contributions:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}
