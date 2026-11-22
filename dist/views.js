import {
  categories,
  expenseCats,
  incomeCats,
  totals,
  shiftMonth,
  monthDate,
  monthOf,
} from "./finance.js";
import { fromMinor } from "./money.js";
import { breakdown, trendChart } from "./charts.js";
import { icon, esc } from "./ui.js";
const names = {
  overview: "Overview",
  transactions: "Transactions",
  budgets: "Budgets",
  members: "Members",
  settings: "Settings",
};
const navIcons = {
  overview: "grid",
  transactions: "swap",
  budgets: "target",
  members: "people",
  settings: "settings",
};
function initials(name) {
  return [
    ...String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2),
  ]
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
function avatar(name, big = false) {
  return `<span class="avatar ${name.charCodeAt(0) % 3 === 0 ? "peach" : ""} ${big ? "big" : ""}">${esc(initials(name))}</span>`;
}
function moneyFormat(currency) {
  const factor = Number(fromMinor(1, currency));
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const base = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.round(-Math.log10(factor)),
  });
  const compact = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return (n, short = false) => (short ? compact : base).format(n * factor);
}
function button(label, act, ico = "", cls = "btn") {
  return `<button type="button" class="${cls}" data-act="${act}">${ico ? icon(ico, 16) : ""}${label}</button>`;
}
function monthName(month, short = false) {
  return monthDate(month).toLocaleDateString("en-GB", {
    month: short ? "short" : "long",
    year: "numeric",
  });
}
function navLink(page, current) {
  return `<button data-page="${page}" class="${current === page ? "active" : ""}" ${current === page ? 'aria-current="page"' : ""}>${icon(navIcons[page])}<span>${names[page]}</span></button>`;
}
function themeControl() {
  const choice = document.documentElement.dataset.themePreference || "system";
  const labels = { system: "System", light: "Light", dark: "Dark" };
  return `<label class="trend-select theme-control">${icon("theme", 16)}<select data-theme-choice aria-label="Color theme">${options(Object.keys(labels), choice, (id) => labels[id])}</select>${icon("down", 12)}</label>`;
}

export function welcome() {
  return `<main id="main" class="entry">
    <section class="entry-copy">
      <div class="entry-header"><div class="entry-brand"><img src="./assets/mark.svg" alt="" width="38" height="38">Spendwell</div>${themeControl()}</div>
      <h1>Household finances, together.</h1>
      <p>Track spending, set monthly budgets, and share a household ledger with the people you live with.</p>
      <button type="button" class="btn google-login" data-act="connect">${googleMark}Sign in with Google</button>
      <p class="entry-hint">Your ledger is stored in the household owner’s Google Drive. Use your invited Google account to join an existing household.</p>
      <a href="./privacy.html">Privacy policy</a>
    </section>
    <div class="entry-art" aria-hidden="true"><img src="./assets/money.svg" alt=""></div>
  </main>`;
}

const googleMark =
  '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285f4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.9z"/><path fill="#34a853" d="M24 44c5.5 0 10.2-1.8 13.5-4.6l-6.6-5a12.3 12.3 0 0 1-18.3-6.5H5.8V33A20 20 0 0 0 24 44z"/><path fill="#fbbc05" d="M12.6 27.9a12 12 0 0 1 0-7.8V15H5.8a20 20 0 0 0 0 18z"/><path fill="#ea4335" d="M24 11.9c3 0 5.6 1 7.6 3l5.7-5.7A19.3 19.3 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.1A12 12 0 0 1 24 12z"/></svg>';

export function householdSetup(s) {
  return `<main id="main" class="entry">
    <section class="entry-copy">
      <div class="entry-header"><div class="entry-brand"><img src="./assets/mark.svg" alt="" width="38" height="38">Spendwell</div>${themeControl()}</div>
      <h1>Set up your household</h1>
      <p>Start a ledger in your Google Drive or open a household that’s already shared with you.</p>
      <div class="entry-options">
        <div>${button("Create household", "create", "plus", "btn primary")}<p>Choose a name and currency. Invite others once your ledger is ready.</p></div>
        <div>${button("Join shared household", "join", "people")}<p>Open the shared ledger from Google Drive using your invited account.</p></div>
      </div>
      <p class="entry-hint">${esc(s.profile.email)}</p>
      ${button(s.connected ? "Switch Google account" : "Reconnect Google", "connect", "", "linkbtn")}
      ${button("Sign out", "signout", "", "linkbtn")}
    </section>
    <div class="entry-art" aria-hidden="true"><img src="./assets/money.svg" alt=""></div>
  </main>`;
}
function shell(s) {
  const { page, profile, home } = s;
  const person = profile.name;
  const month = s.month;
  const status = s.syncError
    ? "Sync needs attention"
    : s.busySync
      ? "Syncing changes…"
      : s.pending
        ? `${s.pending} change${s.pending === 1 ? "" : "s"} to sync`
        : s.synced
          ? "All changes synced"
          : "Saved on this device";
  const finance =
    !!home && ["overview", "transactions", "budgets"].includes(page);
  const displayPage = page,
    m = moneyFormat(home.currency),
    rows = s.rows.filter((x) => x.date.startsWith(month));
  return `<div class="shell"><button class="screen-cover" aria-label="Close navigation" data-act="menu"></button><aside class="sidebar"><button class="brand" data-page="overview"><img src="./assets/mark.svg" alt="">Spendwell</button>
 <button class="house-select" data-act="households"><span class="house-icon">${icon("home", 17)}</span><span class="house-copy"><span class="house-name">${esc(home?.name || "Choose household")}</span><small>Shared workspace</small></span>${icon("chevs", 13)}</button>
 <div class="menu-scroll"><p class="nav-label">Workspace</p><nav class="nav" aria-label="Workspace">${["overview", "transactions", "budgets"].map((p) => navLink(p, page)).join("")}</nav><p class="nav-label">Household</p><nav class="nav" aria-label="Household">${["members", "settings"].map((p) => navLink(p, page)).join("")}</nav></div>
 <div class="side-bottom"><div class="drive-box"><div class="drive-heading">${driveMark()}Google Drive</div><p id="drive-status">${esc(status)}</p><button class="drive-link" data-act="${!s.connected || s.syncError ? "connect" : "sync"}">${!s.connected || s.syncError ? "Reconnect account" : "Sync now"} ${icon("arrow", 13)}</button></div><button class="side-user" data-page="settings">${avatar(person, true)}<span><strong>${esc(person)}</strong><small>Google account</small></span>${icon("chevs", 13)}</button></div></aside>
 <div class="workspace"><header class="topbar"><button class="icon-button menu-toggle" data-act="menu" aria-label="Open menu">${icon("menu")}</button><span class="mobile-brand"><img src="assets/mark.svg" alt="">Spendwell</span><div class="crumb">${icon("layers", 16)}<span>Workspace</span><span class="slash">/</span><b>${names[page] || "Overview"}</b></div>
 <div class="top-actions"><span class="topdate">${icon("cal", 14)}${new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span><span class="top-divider"></span>${themeControl()}<button class="icon-button" data-act="updates" aria-label="Household notifications">${icon("bell", 18)}</button><button class="profile-top" data-page="settings" aria-label="Account settings">${avatar(person)}</button></div></header>
 <main id="main" tabindex="-1" class="main"><div class="heads"><div><h1>${{ overview: "Household overview", transactions: "Transactions", budgets: "Monthly budgets", members: "Household members", settings: "Settings", households: "Your households" }[displayPage]}</h1><p>${{ overview: "Your income, spending, and balance at a glance.", transactions: "All your household activity in one place.", budgets: "Set spending limits for the categories that matter.", members: "Manage the people who share this household.", settings: "Manage your account and Drive connection.", households: "Create a household or open one shared with you." }[displayPage]}</p></div><div class="actions">${finance ? button(month === monthOf(new Date()) ? "This month" : monthName(month, true), "period", "cal", "selector").replace("</button>", icon("down", 12) + "</button>") : ""}${finance && home.role !== "viewer" ? button(page === "budgets" ? "Set budget" : "Add transaction", page === "budgets" ? "budget" : "new", "plus", "btn primary") : ""}${page === "members" && home?.role === "owner" ? button("Invite member", "invite", "plus", "btn primary") : ""}</div></div>
 ${displayPage === "overview" ? overview(s, rows, m) : displayPage === "transactions" ? transactions(s, rows, m) : displayPage === "budgets" ? budgets(s, rows, m) : displayPage === "members" ? members(s) : settings(s, status)}</main></div>
 <nav class="mobile-nav" aria-label="Mobile navigation">${navLink("overview", page)}${navLink("transactions", page)}<button data-act="new"><span class="mobile-add">${icon("plus", 19)}</span>Add</button>${navLink("budgets", page)}<button data-act="menu">${icon("menu")}More</button></nav></div>`;
}
function driveMark() {
  return '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24"><path d="m8 2 8 0 8 14h-8z" fill="#f6c650"/><path d="m8 2 4 7-8 14-4-7z" fill="#68aa83"/><path d="m4 23 4-7h16l-4 7z" fill="#6b97d2"/></svg>';
}
function spark(rows, type, color) {
  const daily = Array(31).fill(0);
  let lastDay = 0;
  for (const row of rows) {
    const day = Number(row.date.slice(-2)) - 1;
    if (day < 0 || day > 30) continue;
    daily[day] +=
      row.type === "income" ? row.amount : type === "net" ? -row.amount : 0;
    lastDay = Math.max(lastDay, day);
  }
  let sum = 0;
  const values = daily.slice(0, lastDay + 1).map((n) => (sum += n));
  values.unshift(0);
  const min = values.reduce((a, b) => Math.min(a, b), 0),
    range = values.reduce((a, b) => Math.max(a, b), 0) - min || 1,
    pts = values
      .map(
        (n, i) =>
          `${1 + (i * 84) / Math.max(1, values.length - 1)},${35 - ((n - min) * 29) / range}`,
      )
      .join(" ");
  return `<svg class="spark" viewBox="0 0 88 40" aria-hidden="true"><polygon points="1,40 ${pts} 85,40" fill="${color}" opacity=".11"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
function overview(s, rows, m) {
  const stats = totals(rows),
    prev = shiftMonth(s.month, -1),
    prior = totals(s.rows.filter((t) => t.date.startsWith(prev)));
  const delta = prior.spent
    ? Math.round(((stats.spent - prior.spent) * 100) / prior.spent)
    : null;
  return `<section class="stats" aria-label="Monthly totals"><article class="stat featured"><div class="statlabel"><span class="s-icon">${icon("wallet", 16)}</span>Total spending</div><strong class="statvalue">${m(stats.spent)}</strong><div class="stat-foot">${delta !== null ? `<span class="change ${delta > 0 ? "bad" : ""}">${icon(delta > 0 ? "trend" : "fall", 12)} ${Math.abs(delta)}%</span> vs last month` : `${rows.filter((t) => t.type === "expense").length} expenses this month`}</div><img class="stat-art" src="./assets/money.svg" alt=""></article>
 <article class="stat"><div class="statlabel"><span class="s-icon">${icon("income", 16)}</span>Total income</div><strong class="statvalue">${m(stats.income)}</strong><div class="stat-foot"><span class="dot green"></span>${rows.filter((t) => t.type === "income").length} income transactions</div>${spark(rows, "income", "#72b496")}</article>
 <article class="stat"><div class="statlabel"><span class="s-icon blue">${icon("balance", 16)}</span>Net balance</div><strong class="statvalue">${m(stats.net)}</strong><div class="stat-foot"><span class="dot blue"></span>Income minus spending</div>${spark(rows, "net", "#849dd1")}</article></section>
 <section class="panels"><article class="panel"><div class="panel-head"><div><h2>Spending breakdown</h2><p>Where your money goes</p></div><label class="trend-select breakdown-mode"><select id="breakdown-mode" aria-label="Group spending by">${options(["category", "member"], s.breakdown, (x) => (x === "member" ? "By member" : "By category"))}</select>${icon("down", 12)}</label></div>${breakdown(stats, m, s.breakdown === "member" ? rows : null)}</article><article class="panel"><div class="panel-head"><div><h2>Spending trend</h2><p>Your spending over time</p></div><label class="trend-select"><select id="trend-mode" aria-label="Trend interval"><option value="daily" ${s.trend === "daily" ? "selected" : ""}>Daily</option><option value="weekly" ${s.trend === "weekly" ? "selected" : ""}>Weekly</option></select>${icon("down", 12)}</label></div>${trendChart(s.rows, s.month, s.trend, m)}</article></section>
 <section class="panel table-panel"><div class="panel-head"><div><h2>Recent transactions</h2><p>Latest activity in your household</p></div><button class="linkbtn" data-page="transactions">View all ${icon("arrow", 14)}</button></div>${table(rows.slice(0, 5), m)}</section>`;
}
function table(rows, m) {
  if (!rows.length)
    return '<div class="empty">No transactions in this view.</div>';
  return `<div class="table-scroll"><table><thead><tr><th>Transaction</th><th class="category-col">Category</th><th class="member-col">Added by</th><th class="date-col">Date</th><th>Amount</th></tr></thead><tbody>${rows
    .map((t) => {
      const c = categories[t.category] || categories.other,
        member = t.member || "Member",
        date = new Date(t.date + "T12:00:00").toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        });
      return `<tr class="tx-row" data-tx="${esc(t.id)}"><td><button class="merchant" data-tx="${esc(t.id)}"><span class="tx-icon" style="--category-bg:${c.bg};--category-ink:${ink(t.category)};--c:${c.color}">${icon(c.icon, 17)}</span><span>${esc(t.title)}<small>${esc(c.name)} · ${esc(date)}</small></span></button></td><td class="category-col"><span class="category" style="--bg:${c.bg};--c:${c.color}">${esc(c.name)}</span></td><td class="member-col"><span class="membercell">${avatar(member)}${esc(member.split(" ")[0])}</span></td><td class="date-col nowrap">${esc(date)}</td><td class="amount ${t.type === "income" ? "positive" : ""}">${t.type === "income" ? "+" : "−"}${m(t.amount)}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function ink(cat) {
  return (
    {
      groceries: "#8055b5",
      dining: "#b27748",
      shopping: "#4c927b",
      transport: "#a1843d",
      bills: "#577fb8",
      salary: "#438363",
    }[cat] || "#837091"
  );
}
function options(values, current, label) {
  return values
    .map(
      (v) =>
        `<option value="${esc(v)}" ${v === current ? "selected" : ""}>${esc(label(v))}</option>`,
    )
    .join("");
}
function filtered(s, rows) {
  return rows.filter(
    (t) =>
      (!s.filters.cat || t.category === s.filters.cat) &&
      (!s.filters.type || t.type === s.filters.type) &&
      (!s.filters.member || (t.memberId || t.member) === s.filters.member) &&
      (!s.filters.q ||
        (t.title + " " + (t.note || ""))
          .toLowerCase()
          .includes(s.filters.q.toLowerCase())),
  );
}
function transactions(s, rows, m) {
  const memberNames = new Map(
    rows.map((t) => [t.memberId || t.member, t.member]),
  );
  const matched = filtered(s, rows),
    pages = Math.max(1, Math.ceil(matched.length / 25));
  s.pg = Math.min(s.pg, pages - 1);
  return `<section class="panel"><div class="filters"><label class="search">${icon("search", 16)}<input id="search" type="search" aria-label="Search transactions" placeholder="Search transactions" value="${esc(s.filters.q)}"></label><select data-filter="type" aria-label="Transaction type"><option value="">All types</option>${options(["expense", "income"], s.filters.type, (x) => x[0].toUpperCase() + x.slice(1))}</select><select data-filter="cat" aria-label="Filter by category"><option value="">All categories</option>${options(Object.keys(categories), s.filters.cat, (x) => categories[x].name)}</select><select data-filter="member" aria-label="Filter by member"><option value="">All members</option>${options([...memberNames.keys()], s.filters.member, (id) => memberNames.get(id))}</select><button class="icon-button" data-act="export" title="Export filtered transactions" aria-label="Export filtered transactions">${icon("download", 17)}</button></div>${table(matched.slice(s.pg * 25, (s.pg + 1) * 25), m)}<div class="pager"><span>${matched.length} transactions</span><div>${s.pg > 0 ? button("Previous", "prev", "", "mini") : ""} ${s.pg < pages - 1 ? button("Next", "next", "", "mini") : ""}</div></div></section>`;
}
function budgets(s, rows, m) {
  const sums = totals(rows).byCategory;
  return `<div class="budget-grid">${expenseCats
    .map((id) => {
      const cat = categories[id],
        spent = sums[id] || 0,
        b =
          s.budgets.find((x) => x.month === s.month && x.category === id)
            ?.amount || 0;
      return `<article class="budgetcard"><div class="budget-title"><span class="tx-icon" style="--category-bg:${cat.bg};--category-ink:${ink(id)};--c:${cat.color}">${icon(cat.icon, 17)}</span><h3>${cat.name}</h3>${s.home.role !== "viewer" ? `<button class="icon-button" aria-label="Edit ${cat.name} budget" data-budget="${id}">${icon("edit", 15)}</button>` : ""}</div><div class="budget-row"><strong>${m(spent)}</strong><span>${b ? "of " + m(b) : "spent"}</span></div><div class="bar"><i style="--c:${cat.color};width:${b ? Math.min(100, (100 * spent) / b) : 0}%"></i></div><small>${!b ? "No budget set" : spent > b ? m(spent - b) + " over budget" : m(b - spent) + " remaining"}</small></article>`;
    })
    .join("")}</div>`;
}
function members(s) {
  return `<section class="panel settings-panel"><h2>${esc(s.home.name)}</h2>${s.peopleError ? `<p class="info">${esc(s.peopleError)}</p>` : ""}${s.people.map((p) => `<div class="person-row"><div>${avatar(p.name, true)}<span><strong>${esc(p.name)}</strong><small>${esc(p.email)}</small></span></div><span class="role">${esc(p.role)}</span></div>`).join("")}${s.profile ? button("Refresh members", "refreshMembers", "sync", "mini") : ""}</section>`;
}
function settings(s, status) {
  return `<section class="panel settings-panel"><h2>Account & storage</h2><div class="setting-row"><div><strong>${esc(s.profile.email)}</strong><p>Connected household data is cached on this device.</p></div>${button("Sign out", "signout")}</div><div class="setting-row"><div><strong>Google Drive</strong><p>${esc(s.syncError || status)}</p></div>${s.profile ? button(s.connected && !s.syncError ? "Sync now" : "Reconnect", s.connected && !s.syncError ? "sync" : "connect", "sync") : ""}</div></section>
 <section class="panel settings-panel"><h2>Households</h2><div class="setting-row"><div><strong>${esc(s.home?.name || "No household selected")}</strong><p>${s.home ? esc(s.home.currency) + " · " + "Drive ledger" : "Open or create a shared ledger."}</p></div>${button("Manage", "households", "home")}</div></section>`;
}

export {
  shell,
  esc,
  avatar,
  button,
  monthName,
  moneyFormat,
  options,
  filtered,
};
