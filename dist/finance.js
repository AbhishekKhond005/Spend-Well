export const categories = {
  groceries: {
    name: "Groceries",
    color: "#a685ea",
    bg: "#f0eafa",
    icon: "cart",
  },
  dining: {
    name: "Food & dining",
    color: "#ffad88",
    bg: "#fff0e6",
    icon: "dining",
  },
  shopping: { name: "Shopping", color: "#82cbb2", bg: "#e7f5ec", icon: "bag" },
  transport: {
    name: "Transport",
    color: "#f5cf79",
    bg: "#fff6d8",
    icon: "car",
  },
  bills: {
    name: "Bills & utilities",
    color: "#84ace0",
    bg: "#eaf1fc",
    icon: "bolt",
  },
  other: { name: "Other", color: "#c7bbcd", bg: "#f1edf4", icon: "other" },
  salary: { name: "Salary", color: "#64b598", bg: "#e2f5eb", icon: "work" },
  earnings: {
    name: "Other income",
    color: "#84ace0",
    bg: "#eaf1fc",
    icon: "income",
  },
};
export const expenseCats = [
  "groceries",
  "dining",
  "shopping",
  "transport",
  "bills",
  "other",
];
export const incomeCats = ["salary", "earnings"];
export const isoDay = (d) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
export const monthOf = (d) => isoDay(d).slice(0, 7);
export const monthDate = (m) =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1);
export function shiftMonth(m, n) {
  const d = monthDate(m);
  d.setMonth(d.getMonth() + n);
  return monthOf(d);
}
export function monthDays(m) {
  const d = monthDate(m);
  d.setMonth(d.getMonth() + 1, 0);
  return d.getDate();
}
export function totals(rows) {
  let spent = 0,
    income = 0;
  const byCategory = {};
  for (const tx of rows) {
    if (tx.type === "income") {
      income += tx.amount;
    } else {
      spent += tx.amount;
      byCategory[tx.category] = (byCategory[tx.category] || 0) + tx.amount;
    }
  }
  return { spent, income, net: income - spent, byCategory };
}
export function series(rows, month, days, mode = "daily") {
  const values = Array(mode === "weekly" ? Math.ceil(days / 7) : days).fill(0);
  for (const row of rows) {
    const day = Number(row.date.slice(-2));
    if (row.type === "expense" && row.date.startsWith(month) && day <= days)
      values[mode === "weekly" ? Math.floor((day - 1) / 7) : day - 1] +=
        row.amount;
  }
  return values;
}
