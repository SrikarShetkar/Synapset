export function calculateRetention(daysSinceStudy: number, difficulty: number): number {
  const stabilityFactor = Math.max(1, 10 - difficulty * 1.5);
  const retention = Math.exp(-daysSinceStudy / stabilityFactor);
  return Math.max(0, Math.min(1, retention));
}

export function getOptimalRevisionDay(difficulty: number): number {
  const s = Math.max(1, 10 - difficulty * 1.5);
  return s * Math.log(2);
}

export function generateCurvePoints(difficulty: number, daysAhead: number = 30): Array<{ day: number; retention: number }> {
  const points: Array<{ day: number; retention: number }> = [];
  for (let d = 0; d <= daysAhead; d += 0.5) {
    points.push({ day: d, retention: calculateRetention(d, difficulty) * 100 });
  }
  return points;
}
