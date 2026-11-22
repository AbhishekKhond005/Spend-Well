import {
  categories,
  expenseCats,
  series,
  monthDays,
  monthOf,
  shiftMonth,
} from "./finance.js";
import { esc } from "./ui.js";

export function breakdown(stats, money, memberRows = null) {
  let groups;
  if (memberRows) {
    const members = new Map();
    for (const row of memberRows) {
      if (row.type !== "expense") continue;
      const id = row.memberId || row.member;
      const group = members.get(id) || {
        name: row.member,
        amount: 0,
        color: categories[expenseCats[members.size % expenseCats.length]].color,
        target: 'data-person="' + esc(id) + '"',
      };
      group.amount += row.amount;
      members.set(id, group);
    }
    groups = [...members.values()];
  } else {
    groups = expenseCats.map((id) => ({
      ...categories[id],
      amount: stats.byCategory[id] || 0,
      target: 'data-cat="' + id + '"',
    }));
  }
  const parts = groups
    .filter((part) => part.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  let offset = 0;
  const arcs = parts
    .map(({ name, amount, target, color }) => {
      const portion = (100 * amount) / stats.spent,
        start = offset;
      offset += portion;
      return `<circle cx="100" cy="100" r="76" pathLength="100" fill="none" stroke="${color}" stroke-width="31" stroke-dasharray="${Math.max(0, portion - (parts.length > 1 ? 0.7 : 0))} 100" stroke-dashoffset="${-start}" transform="rotate(-90 100 100)" ${target}><title>${esc(name)} · ${money(amount)}</title></circle>`;
    })
    .join("");
  const legend = parts
    .map(
      ({ name, amount, color, target }) =>
        `<button class="legend-row" ${target}><i style="--c:${color}"></i><span>${esc(name)}</span><b>${money(amount)}</b><small>${Math.round((100 * amount) / stats.spent)}%</small></button>`,
    )
    .join("");
  return `<div class="breakdown-chart"><div class="donut"><svg viewBox="0 0 200 200" aria-label="Spending by ${memberRows ? "member" : "category"}"><circle cx="100" cy="100" r="76" fill="none" stroke="var(--chart-track)" stroke-width="30"/>${arcs}</svg><div class="donut-label"><small>Total spent</small><strong>${money(stats.spent)}</strong></div></div><div class="legend">${legend || "<small>Add an expense to see your breakdown.</small>"}</div></div>`;
}
function smooth(points) {
  if (!points.length) return "";
  let d = "M" + points[0].join(" ");
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      mid = (a[0] + b[0]) / 2;
    d +=
      " C" +
      mid +
      " " +
      a[1] +
      " " +
      mid +
      " " +
      b[1] +
      " " +
      b[0] +
      " " +
      b[1];
  }
  return d;
}
export function trendChart(rows, month, mode, money) {
  const now = new Date(),
    days = month === monthOf(now) ? now.getDate() : monthDays(month);
  const prev = shiftMonth(month, -1);
  const data = series(rows, month, days, mode),
    compare = series(rows, prev, Math.min(days, monthDays(prev)), mode);
  const peak = Math.max(...data, ...compare, 100);
  const unit = 10 ** Math.floor(Math.log10(peak / 3)),
    step =
      ([1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].find(
        (n) => n >= peak / 3 / unit,
      ) || 10) * unit,
    max = 3 * step;
  const w = 408,
    h = 104,
    x0 = 0,
    y0 = 7;
  const points = (a) =>
    a.map((n, i) => [
      x0 + (i * w) / Math.max(1, data.length - 1),
      y0 + h - (h * n) / max,
    ]);
  const cur = points(data),
    past = points(compare);
  const grid = [3, 2, 1, 0]
    .map(
      (i) =>
        '<line x1="0" x2="408" y1="' +
        (y0 + h - (h * i) / 3) +
        '" y2="' +
        (y0 + h - (h * i) / 3) +
        '" stroke="var(--chart-grid)" stroke-dasharray="3 4"/>',
    )
    .join("");
  const ticks = Array.from(
    new Set([
      0,
      Math.round((data.length - 1) * 0.25),
      Math.round((data.length - 1) * 0.5),
      Math.round((data.length - 1) * 0.75),
      data.length - 1,
    ]),
  );
  const svg =
    '<svg class="plot" viewBox="0 0 408 120" preserveAspectRatio="none" aria-label="' +
    mode +
    ' expenses this period and the previous month"><defs><linearGradient id="lavender-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#af8fe9" stop-opacity=".36"/><stop offset="100%" stop-color="#af8fe9" stop-opacity=".035"/></linearGradient></defs>' +
    grid +
    '<path d="' +
    smooth(cur) +
    " L" +
    cur.at(-1)[0] +
    " " +
    (h + y0) +
    " L0 " +
    (h + y0) +
    ' Z" fill="url(#lavender-fill)"/><path d="' +
    smooth(past) +
    '" fill="none" stroke="var(--chart-previous)" stroke-width="2" stroke-dasharray="4 5" vector-effect="non-scaling-stroke"/><path d="' +
    smooth(cur) +
    '" fill="none" stroke="var(--chart-accent)" stroke-width="2.7" vector-effect="non-scaling-stroke"/>' +
    cur
      .map(
        ([x, y], i) =>
          '<circle cx="' +
          x +
          '" cy="' +
          y +
          '" r="5" fill="transparent"><title>' +
          (mode === "weekly" ? "Week " : "Day ") +
          (i + 1) +
          " · " +
          money(data[i]) +
          "</title></circle>",
      )
      .join("") +
    "</svg>";
  return (
    '<div class="chart-key"><span><i></i>Selected month</span><span><i></i>Previous month</span></div><div class="chartbody"><div class="axis-y">' +
    [3, 2, 1, 0]
      .map((i) => "<span>" + money(step * i, true) + "</span>")
      .join("") +
    '</div><div class="plot-wrap">' +
    svg +
    '<div class="axis-x">' +
    ticks
      .map(
        (i) =>
          "<span>" +
          (mode === "weekly"
            ? "Wk " + (i + 1)
            : new Date(
                month + "-" + String(i + 1).padStart(2, "0") + "T12:00:00",
              ).toLocaleDateString("en-GB", {
                month: "short",
                day: "numeric",
              })) +
          "</span>",
      )
      .join("") +
    "</div></div></div>"
  );
}
