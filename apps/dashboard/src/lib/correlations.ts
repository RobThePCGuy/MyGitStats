import type { DayEntry } from "./types.js";

export interface Spike {
  date: string;
  viewsActual: number;
  viewsAverage: number;
  starsGained: number;
}

/**
 * Detect traffic spikes where daily views exceed 2x the 7-day rolling average.
 * For each spike, report whether stars also increased that day.
 */
export function detectSpikes(days: DayEntry[]): Spike[] {
  const spikes: Spike[] = [];

  if (days.length < 7) return spikes;

  for (let i = 6; i < days.length; i++) {
    // Calculate 7-day rolling average (preceding 7 days including current)
    let sum = 0;
    for (let j = i - 6; j <= i; j++) {
      sum += days[j].views;
    }
    const avg = sum / 7;

    const current = days[i];

    // Spike: views exceed 2x the rolling average (and average is non-zero)
    if (avg > 0 && current.views > 2 * avg) {
      // Determine stars gained: difference from previous day
      const prevStars = i > 0 ? days[i - 1].stars : current.stars;
      const starsGained = current.stars - prevStars;

      spikes.push({
        date: current.date,
        viewsActual: current.views,
        viewsAverage: Math.round(avg * 10) / 10,
        starsGained: Math.max(0, starsGained),
      });
    }
  }

  return spikes;
}
