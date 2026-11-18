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
export function demoData(now = new Date()) {
  const current = monthOf(now),
    previous = shiftMonth(current, -1),
    events = [];
  const names = {
    groceries: [
      "FreshMart groceries",
      "Weekly vegetable shop",
      "BigBasket order",
    ],
    dining: ["Lunch at The Pantry", "Blue Tokai Coffee", "Dinner at Social"],
    shopping: ["Weekend shopping", "Home essentials"],
    transport: ["Uber ride", "Metro recharge"],
    bills: ["Electricity bill", "Broadband plan"],
    other: ["Movie night", "Bookstore visit"],
  };
  const ids = [
    "groceries",
    "dining",
    "shopping",
    "transport",
    "groceries",
    "bills",
    "dining",
    "groceries",
    "shopping",
    "other",
    "groceries",
    "transport",
    "dining",
    "shopping",
    "groceries",
    "bills",
    "transport",
    "dining",
    "groceries",
    "shopping",
    "dining",
    "transport",
    "groceries",
  ];
  const amounts = [
    1875, 1620, 2450, 560, 1740, 1450, 1150, 2140, 1580, 840, 1260, 810, 960,
    780, 1420, 749, 620, 890, 1120, 745, 485, 320, 1840,
  ];
  for (const [index, month] of [current, previous].entries()) {
    const length = index ? monthDays(month) : now.getDate();
    ids.forEach((category, i) => {
      const day = 1 + Math.round(((length - 1) * i) / (ids.length - 1));
      const date = month + "-" + String(day).padStart(2, "0"),
        id = "sample-" + month + "-" + String(i).padStart(2, "0");
      const person = i % 3 === 0 ? "Maya Sharma" : "Alex Sharma";
      events.push({
        kind: "tx",
        key: id,
        value: {
          id,
          type: "expense",
          amount: Math.round(amounts[i] * (index ? 1.12 : 1)) * 100,
          category,
          date,
          title: names[category][i % names[category].length],
          member: person,
          memberId: person.split(" ")[0],
          note: "",
          created: i,
        },
      });
    });
    for (const [i, member] of ["Alex Sharma", "Maya Sharma"].entries()) {
      const id = "income-" + month + i;
      events.push({
        kind: "tx",
        key: id,
        value: {
          id,
          type: "income",
          amount: (i ? 24000 : 42000) * 100,
          title: i ? "Design project" : "Monthly salary",
          category: i ? "earnings" : "salary",
          date: month + "-01",
          created: 0,
          member,
          memberId: member.split(" ")[0],
          note: "",
        },
      });
    }
  }
  for (const [category, amount] of Object.entries({
    groceries: 16000,
    dining: 9000,
    shopping: 8000,
    transport: 5000,
    bills: 4500,
    other: 2000,
  })) {
    events.push({
      kind: "budget",
      key: current + "/" + category,
      value: { month: current, category, amount: amount * 100 },
    });
  }
  return events;
}
