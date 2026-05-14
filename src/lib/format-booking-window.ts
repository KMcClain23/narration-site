const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function formatBookingWindow(months: number[]): string {
  if (!months.length) return "";
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  const sorted = [...months].sort((a, b) => a - b);

  if (sorted.length === 1) {
    const m = sorted[0];
    return `${MONTH_NAMES[m - 1]} ${m >= curMonth ? curYear : curYear + 1}`;
  }

  let maxGap = 0;
  let breakAfter = sorted.length - 1;
  for (let i = 0; i < sorted.length; i++) {
    const gap = (sorted[(i + 1) % sorted.length] - sorted[i] + 12) % 12;
    if (gap > maxGap) { maxGap = gap; breakAfter = i; }
  }

  const startMonth = sorted[(breakAfter + 1) % sorted.length];
  const endMonth = sorted[breakAfter];
  const startYear = startMonth >= curMonth ? curYear : curYear + 1;
  const endYear = endMonth >= startMonth ? startYear : startYear + 1;

  return startYear === endYear
    ? `${MONTH_NAMES[startMonth - 1]}–${MONTH_NAMES[endMonth - 1]} ${startYear}`
    : `${MONTH_NAMES[startMonth - 1]} ${startYear}–${MONTH_NAMES[endMonth - 1]} ${endYear}`;
}
