import {
  openLedger,
  prepareGoogle,
  signInGoogle,
  signOutGoogle,
  getGoogleSession,
} from "./cloud.js";
import { GOOGLE_CLIENT_ID, GOOGLE_API_KEY, GOOGLE_APP_ID } from "./config.js";
import {
  categories,
  expenseCats,
  incomeCats,
  totals,
  isoDay,
  monthOf,
  shiftMonth,
  monthDays,
} from "./finance.js";
import {
  shell,
  welcome,
  householdSetup,
  esc,
  button,
  monthName,
  moneyFormat,
  options,
  filtered,
} from "./views.js";
import { icon } from "./ui.js";
import { toMinor, fromMinor, exportCSV } from "./money.js";
const root = document.querySelector("#app"),
  dialog = document.querySelector("#modal"),
  inner = document.querySelector("#modal-inner");
const prefix = "spendwell:" + new URL(".", location.href).pathname + ":";
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const remember = (key, v) =>
  localStorage.setItem(prefix + key, JSON.stringify(v));
const currentMonth = () => monthOf(new Date());
const cleanFilters = () => ({ q: "", cat: "", type: "", member: "" });
const s = {
  page: "overview",
  month: currentMonth(),
  trend: "daily",
  breakdown: "category",
  pg: 0,
  filters: cleanFilters(),
  profile: read("profile", null),
  home: null,
  homes: [],
  rows: [],
  budgets: [],
  people: [],
  peopleError: "",
  ledger: null,
  connected: false,
  synced: false,
  pending: 0,
  busySync: false,
  syncError: "",
};
let retryAfter = 0,
  scope = 0,
  syncTimer,
  noticeTimer,
  saveHandler = null,
  committing = false,
  loadCounter = 0;
const channel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel(prefix + "edits")
    : null;
function notify(message) {
  const el = document.querySelector("#notice");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.remove("show"), 3800);
}
function render() {
  const mobileMenu = root.querySelector(".sidebar.show") !== null;
  const activeSearch =
    document.activeElement?.id === "search" ? document.activeElement : null;
  const caret = activeSearch?.selectionStart;
  s.connected = !!getGoogleSession();
  root.innerHTML = !s.profile
    ? welcome()
    : !s.home
      ? householdSetup(s)
      : shell(s);
  if (mobileMenu && s.home) {
    root.querySelector(".sidebar").classList.add("show");
    root.querySelector(".screen-cover").classList.add("open");
  }
  if (activeSearch) {
    const next = root.querySelector("#search");
    next?.focus({ preventScroll: true });
    next?.setSelectionRange(caret, caret);
  }
}
function close() {
  dialog.close();
}
function modal(title, body, handler = null, focus = "") {
  saveHandler = handler;
  inner.innerHTML = `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-button" data-act="close" aria-label="Close dialog">${icon("close", 18)}</button></div><div class="modal-body">${body}<p class="modal-err" role="alert"></p></div>`;
  dialog.setAttribute("aria-labelledby", "modal-title");
  if (!dialog.open) dialog.showModal();
  if (focus) inner.querySelector(focus)?.focus();
}
function form(body, submit, extra = "") {
  return `<form><div class="formgrid">${body}</div><div class="modal-foot">${extra}${button("Cancel", "close")}<button type="submit" class="btn primary">${submit}</button></div></form>`;
}
function field(label, control, full = false) {
  return `<label class="field ${full ? "full" : ""}"><span>${label}</span>${control}</label>`;
}
function showError(error) {
  const message = error?.message || String(error);
  const el = dialog.open && inner.querySelector(".modal-err");
  if (el) el.textContent = message;
  else notify(message);
}
function safePage(p) {
  return [
    "overview",
    "transactions",
    "budgets",
    "members",
    "settings",
  ].includes(p)
    ? p
    : "overview";
}
function navigate(page, reset = true) {
  if (dialog.open) close();
  root.querySelector(".sidebar.show")?.classList.remove("show");
  s.page = safePage(page);
  if (reset) {
    s.filters = cleanFilters();
    s.pg = 0;
  }
  if (location.hash.slice(1) !== s.page)
    history.pushState(null, "", "#" + s.page);
  render();
  window.scrollTo(0, 0);
  if (s.page === "members") fetchMembers();
}
function installHeads(heads) {
  s.rows = [];
  s.budgets = [];
  for (const h of heads) {
    const v = h.value;
    if (!v) continue;
    if (
      h.kind === "tx" &&
      typeof v.date === "string" &&
      typeof v.title === "string" &&
      Number.isSafeInteger(v.amount) &&
      v.amount > 0 &&
      ["income", "expense"].includes(v.type)
    ) {
      s.rows.push({ ...v, id: h.key, member: String(v.member || "Member") });
    }
    if (h.kind === "budget" && Number.isSafeInteger(v.amount) && v.amount > 0)
      s.budgets.push(v);
  }
  s.rows.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.created || 0) - (a.created || 0) ||
      b.id.localeCompare(a.id),
  );
}
async function readHead() {
  const ticket = scope,
    version = ++loadCounter;
  if (!s.home) {
    installHeads([]);
    render();
    return;
  }
  const [heads, pending] = await Promise.all([
    s.ledger.all(s.home.id),
    s.ledger.pending(s.home.id),
  ]);
  if (ticket !== scope || version !== loadCounter) return;
  installHeads(heads);
  s.pending = pending;
  render();
}
async function openHome(home) {
  scope++;
  retryAfter = 0;
  clearTimeout(syncTimer);
  s.home = home;
  s.rows = [];
  s.budgets = [];
  s.pending = 0;
  s.synced = false;
  s.busySync = false;
  s.syncError = "";
  s.peopleError = "";
  s.people = [];
  s.pg = 0;
  s.filters = cleanFilters();
  if (home) {
    remember("home:" + s.profile.id, home.id);
    await readHead();
  } else render();
  if (s.page === "members") fetchMembers();
  if (home && s.profile && getGoogleSession()) void syncNow();
}
async function loadAccount(profile) {
  const stamp = ++scope;
  s.profile = profile;
  s.home = null;
  s.homes = [];
  s.rows = [];
  s.budgets = [];
  s.people = [];
  s.ledger = null;
  if (!profile) {
    await openHome(null);
    return;
  }
  const ledger = await openLedger(profile.id);
  if (stamp !== scope) return;
  s.ledger = ledger;
  let homes;
  try {
    homes = await ledger.listHouseholds();
  } catch (error) {
    if (stamp !== scope) return;
    s.syncError = error.message;
    render();
    throw error;
  }
  if (stamp !== scope) return;
  s.homes = homes;
  await openHome(
    s.homes.find((h) => h.id === read("home:" + profile.id, "")) ||
      s.homes[0] ||
      null,
  );
}
async function save(changes) {
  if (!s.home || !s.ledger) throw Error("Choose a household first.");
  const ticket = scope,
    home = s.home.id,
    account = s.profile.id;
  const written = await s.ledger.putMany(changes, home);
  if (scope !== ticket) return;
  for (const event of written) {
    if (event.kind === "tx") {
      s.rows = s.rows.filter((row) => row.id !== event.key);
      if (event.value) s.rows.push({ ...event.value, id: event.key });
    } else if (event.kind === "budget") {
      s.budgets = s.budgets.filter(
        (b) => b.month + "/" + b.category !== event.key,
      );
      if (event.value) s.budgets.push(event.value);
    }
  }
  s.rows.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.created || 0) - (a.created || 0) ||
      b.id.localeCompare(a.id),
  );
  s.pending = await s.ledger.pending(home);
  if (scope !== ticket) return;
  render();
  channel?.postMessage({ home, account });
  scheduleSync(650);
}
function scheduleSync(ms) {
  clearTimeout(syncTimer);
  if (s.profile && getGoogleSession() && s.home)
    syncTimer = setTimeout(() => void syncNow(), ms);
}
async function syncNow(manual = false) {
  if (!s.profile || !s.home) return;
  if (!getGoogleSession()) {
    if (manual) await connect();
    return;
  }
  if (s.busySync) {
    if (manual) notify("Sync in progress.");
    return;
  }
  const ticket = scope,
    previousError = s.syncError;
  s.busySync = true;
  s.syncError = "";
  if (manual) render();
  try {
    const result = await s.ledger.sync(s.home.id);
    if (ticket !== scope) return;
    s.synced = true;
    retryAfter = 0;
    if (result.downloaded || result.uploaded) await readHead();
    if (manual) notify("Household is up to date.");
  } catch (error) {
    if (ticket === scope) {
      s.syncError = error.message;
      retryAfter = Date.now() + 60000;
      if (manual) showError(error);
    }
  } finally {
    if (ticket === scope) {
      s.busySync = false;
      if (
        manual ||
        s.syncError ||
        s.page === "settings" ||
        previousError !== s.syncError
      )
        render();
      else {
        const status = root.querySelector("#drive-status");
        if (status)
          status.textContent = s.pending
            ? s.pending + " changes to sync"
            : "All changes synced";
      }
      if (s.pending && !s.syncError) scheduleSync(800);
    }
  }
}
async function fetchMembers() {
  if (!s.profile || !s.home) return;
  const ticket = scope;
  try {
    const people = await s.ledger.members(s.home.id);
    if (ticket === scope) {
      s.people = people;
      s.peopleError = "";
      render();
    }
  } catch (e) {
    if (ticket === scope) {
      s.peopleError = e.message;
      render();
    }
  }
}
function showHomes() {
  const homes = s.homes
    .map(
      (h) =>
        `<button data-home="${esc(h.id)}" class="${h.id === s.home?.id ? "chosen" : ""}"><span>${icon("home", 16)} &nbsp;${esc(h.name)}</span>${h.id === s.home?.id ? icon("check", 16) : ""}</button>`,
    )
    .join("");
  modal(
    "Your households",
    `<div class="picker-list">${homes}</div><div class="buttons-stack">${button("Create household", "create", "plus", "btn primary")}${button("Join shared household", "join", "people")}</div>`,
  );
}
async function connect(after) {
  if (!GOOGLE_CLIENT_ID) {
    modal(
      "Connect Google Drive",
      `<p class="info">This deployment needs a Google OAuth client before it can create a shared household.</p><div class="setup-note"><strong>For the site owner</strong><p>Enable Google Drive, Sheets, and Picker in Google Cloud. Add the public client ID, Picker key, and project number to your hosting configuration, then redeploy.</p></div><a class="btn" href="./google-setup.html" target="_blank" rel="noopener">Open setup guide ${icon("diag", 14)}</a>`,
    );
    return;
  }
  // Only user gestures invoke the Google popup. The library is preloaded after boot.
  const profile = await signInGoogle(GOOGLE_CLIENT_ID);
  if (dialog.open) close();
  remember("profile", profile);
  await loadAccount(profile);
  if (after === "create") createForm();
  else if (after === "join") await joinHome();
  else if (after === "invite" && s.home) inviteForm();
  else if (s.home) notify("Connected to Google Drive.");
}
function requireGoogle(next) {
  if (getGoogleSession() && s.profile) return true;
  modal(
    "Choose a Google account",
    `<p class="info">${next === "create" ? "The account you choose will own your household ledger in Google Drive." : "Connect the Google account invited to this household."}</p>${button("Continue with Google", "auth-" + next, "cloud", "btn primary")}`,
  );
  return false;
}
function createForm() {
  if (!requireGoogle("create")) return;
  modal(
    "Create household",
    `<p class="info">The ledger will be stored in <strong>${esc(s.profile.email)}</strong>’s Drive. You can invite others after creation. <button type="button" class="linkbtn" data-act="auth-create">Change account</button></p>` +
      form(
        field(
          "Household name",
          '<input name="name" maxlength="80" required placeholder="e.g. Our household">',
          true,
        ) +
          field(
            "Household currency",
            `<select name="currency">${options(["INR", "USD", "EUR", "GBP", "CAD", "AUD", "SGD", "AED", "JPY", "CHF", "NZD", "BRL", "KWD"], "INR", (x) => x + " · " + new Intl.DisplayNames("en", { type: "currency" }).of(x))}</select>`,
            true,
          ),
        "Create household",
      ),
    async (f) => {
      const name = f.get("name").trim();
      if (!name) throw Error("Enter a household name.");
      const id = await s.ledger.createHousehold(name, f.get("currency"));
      s.homes = await s.ledger.listHouseholds();
      await openHome(s.homes.find((h) => h.id === id));
      close();
      navigate("overview");
      notify("Household created on Google Drive.");
    },
    "input",
  );
}
async function joinHome() {
  if (!requireGoogle("join")) return;
  if (!GOOGLE_API_KEY || !GOOGLE_APP_ID)
    throw Error(
      "Set the Picker API key and Google project number in the site’s configuration to join a household.",
    );
  if (dialog.open) close();
  const h = await s.ledger.joinGroup({
    apiKey: GOOGLE_API_KEY,
    appId: GOOGLE_APP_ID,
  });
  s.homes = await s.ledger.listHouseholds();
  await openHome(h);
  navigate("overview");
  notify("Joined " + h.name + ".");
}
function inviteForm() {
  if (!s.profile) {
    requireGoogle("create");
    return;
  }
  if (!requireGoogle("invite")) return;
  if (s.home?.role !== "owner")
    throw Error("Only the household owner can invite editors.");
  modal(
    "Invite a member",
    `<p class="info">Give this Google account editor access to ${esc(s.home.name)}. Google will email the invitation. They can then choose “Join shared household” in Spendwell.</p>` +
      form(
        field(
          "Google email address",
          '<input name="email" type="email" required autocomplete="email" placeholder="name@gmail.com">',
          true,
        ),
        "Send invitation",
      ),
    async (f) => {
      await s.ledger.invite(s.home.id, f.get("email"));
      close();
      await fetchMembers();
      notify("Invitation sent.");
    },
    "input",
  );
}
function showPeriod() {
  const m = currentMonth(),
    months = [
      ...new Set([
        m,
        shiftMonth(m, -1),
        ...s.rows.map((t) => t.date.slice(0, 7)),
        s.month,
      ]),
    ]
      .sort()
      .reverse();
  modal(
    "Choose a month",
    `<div class="picker-list">${months
      .slice(0, 6)
      .map(
        (x) =>
          `<button data-month="${x}" class="${s.month === x ? "chosen" : ""}"><span>${monthName(x)}${x === m ? " · This month" : ""}</span>${s.month === x ? icon("check", 16) : ""}</button>`,
      )
      .join("")}</div>` +
      form(
        field(
          "Other month",
          `<input type="month" name="month" min="1900-01" max="9999-12" required value="${s.month}">`,
          true,
        ),
        "Apply",
      ),
    (f) => selectMonth(f.get("month")),
  );
}
function selectMonth(month) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))
    throw Error("Choose a valid month.");
  s.month = month;
  s.pg = 0;
  close();
  render();
}
function showBudget(category = expenseCats[0]) {
  if (!s.home) {
    showHomes();
    return;
  }
  const existing = s.budgets.find(
    (b) => b.month === s.month && b.category === category,
  );
  const currency = s.home.currency;
  modal(
    "Monthly budget",
    `<p class="info">${monthName(s.month)} · ${esc(s.home.name)}</p>` +
      form(
        field(
          "Category",
          `<select name="category" id="budget-category">${options(expenseCats, category, (id) => categories[id].name)}</select>`,
          true,
        ) +
          field(
            `Spending limit (${esc(currency)})`,
            `<input name="amount" inputmode="decimal" required value="${existing ? fromMinor(existing.amount, currency) : ""}" placeholder="0.00">`,
            true,
          ),
        "Save budget",
      ),
    async (f) => {
      const amount = toMinor(f.get("amount"), currency);
      if (amount <= 0) throw Error("Enter a spending limit above zero.");
      const category = f.get("category");
      await save([
        {
          kind: "budget",
          key: s.month + "/" + category,
          value: { month: s.month, category, amount },
        },
      ]);
      close();
      notify("Budget saved.");
    },
  );
}
let draft = null;
function txForm(tx = null, copy = false) {
  if (!s.home) {
    showHomes();
    return;
  }
  if (s.home.role === "viewer") {
    if (tx)
      modal(
        tx.title,
        `<p class="info">${esc(tx.date)} · ${esc(tx.member)} · ${esc(categories[tx.category]?.name)}</p><h2>${moneyFormat(s.home.currency)(tx.amount)}</h2><p class="info">${esc(tx.note)}</p>`,
      );
    else notify("Ask the owner for editor access.");
    return;
  }
  const date =
    s.month === currentMonth()
      ? isoDay(new Date())
      : s.month +
        "-" +
        String(Math.min(new Date().getDate(), monthDays(s.month))).padStart(
          2,
          "0",
        );
  const self = s.profile;
  draft = tx
    ? {
        ...tx,
        ...(copy
          ? { id: null, date, member: self.name, memberId: self.id }
          : {}),
      }
    : {
        type: "expense",
        date,
        title: "",
        amount: null,
        category: read("category:" + s.home.id, "groceries"),
        note: "",
        member: self.name,
        memberId: self.id,
      };
  drawTx(true);
}
function drawTx(focus = false) {
  const t = draft,
    c = s.home.currency;
  const list = t.type === "income" ? incomeCats : expenseCats;
  if (!list.includes(t.category)) t.category = list[0];
  const todayAmount =
    t.amountInput ?? (t.amount !== null ? fromMinor(t.amount, c) : "");
  const recent = [
    ...new Set(s.rows.filter((x) => x.type === t.type).map((x) => x.title)),
  ].slice(0, 50);
  modal(
    t.id ? "Edit transaction" : "Add transaction",
    `<div class="type-switch" aria-label="Transaction type">${["expense", "income"].map((x) => `<button data-txtype="${x}" aria-pressed="${t.type === x}" class="${t.type === x ? "selected" : ""}">${x === "income" ? "Income" : "Expense"}</button>`).join("")}</div>` +
      form(
        field(
          `Amount (${esc(c)})`,
          `<input name="amount" inputmode="decimal" placeholder="0.00" required autocomplete="off" value="${esc(todayAmount)}">`,
          true,
        ) +
          field(
            "Description",
            `<input name="title" list="recent-titles" placeholder="e.g. Weekly groceries" required maxlength="120" value="${esc(t.title)}"><datalist id="recent-titles">${recent.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`,
            true,
          ) +
          field(
            "Category",
            `<select name="category">${options(list, t.category, (x) => categories[x].name)}</select>`,
          ) +
          field(
            "Date",
            `<input name="date" type="date" min="1900-01-01" max="9999-12-31" required value="${esc(t.date)}">`,
          ) +
          field(
            "Note (optional)",
            `<textarea name="note" rows="2" maxlength="1200" placeholder="Add a note">${esc(t.note)}</textarea>`,
            true,
          ),
        t.id ? "Save changes" : "Save transaction",
        t.id
          ? `<button type="button" class="icon-button danger" data-act="delete" aria-label="Delete transaction">${icon("trash", 17)}</button><button type="button" class="mini" data-act="copy">Duplicate</button>`
          : "",
      ),
    async (f) => {
      const amount = toMinor(f.get("amount"), c);
      if (amount <= 0) throw Error("Enter an amount above zero.");
      const title = f.get("title").trim(),
        date = f.get("date");
      if (!title) throw Error("Enter a description.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("Enter a valid date.");
      const id = t.id || crypto.randomUUID(),
        category = f.get("category");
      const value = {
        id,
        type: t.type,
        amount,
        title,
        date,
        category,
        note: f.get("note").trim(),
        member: t.member,
        memberId: t.memberId,
        created: t.id ? t.created : Date.now(),
      };
      await save([{ kind: "tx", key: id, value }]);
      if (t.type === "expense") remember("category:" + s.home.id, category);
      s.month = date.slice(0, 7);
      close();
      render();
      notify(t.id ? "Transaction updated." : "Transaction added.");
    },
    focus ? 'input[name="amount"]' : "",
  );
}
function deleteTx() {
  const id = draft?.id;
  if (!id) return;
  modal(
    "Delete transaction?",
    `<p class="info">Remove “${esc(draft.title)}” from this household’s totals?</p>` +
      form("", "Delete transaction"),
    async () => {
      await save([{ kind: "tx", key: id, value: null }]);
      close();
      notify("Transaction deleted.");
    },
  );
}
function exportRows() {
  const rows = filtered(
    s,
    s.rows.filter((t) => t.date.startsWith(s.month)),
  );
  const data = exportCSV(
    [
      "Date",
      "Description",
      "Type",
      "Category",
      "Amount",
      "Currency",
      "Added by",
      "Note",
    ],
    rows.map((t) => [
      t.date,
      t.title,
      t.type,
      categories[t.category]?.name || "Other",
      fromMinor(t.amount, s.home.currency),
      s.home.currency,
      t.member,
      t.note,
    ]),
  );
  const url = URL.createObjectURL(
    new Blob(["\ufeff", data], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "spendwell-" + s.month + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function updates() {
  const spent = totals(
      s.rows.filter((t) => t.date.startsWith(s.month)),
    ).byCategory,
    m = moneyFormat(s.home?.currency || "INR");
  const alerts = s.budgets.filter(
    (b) => b.month === s.month && (spent[b.category] || 0) >= b.amount * 0.8,
  );
  const messages = alerts.map(
    (b) =>
      `<div class="notice-item">${icon("target", 19)}<div><strong>${esc(categories[b.category]?.name || b.category)} budget</strong><p>${m(spent[b.category])} of ${m(b.amount)} used this month.</p></div></div>`,
  );
  if (s.syncError) messages.push(`<p class="info">${esc(s.syncError)}</p>`);
  if (!messages.length)
    messages.push(
      '<p class="info">You’re all caught up. Budget alerts appear here when spending reaches 80% of a category limit.</p>',
    );
  modal(
    "Household notifications",
    `<div class="inbox">${messages.join("")}</div>`,
  );
}
async function act(action) {
  switch (action) {
    case "menu": {
      const open = document.querySelector(".sidebar").classList.toggle("show");
      document.querySelector(".screen-cover").classList.toggle("open", open);
      break;
    }
    case "close":
      close();
      break;
    case "new":
      txForm();
      break;
    case "period":
      showPeriod();
      break;
    case "budget":
      showBudget();
      break;
    case "households":
      showHomes();
      break;
    case "connect":
      await connect();
      break;
    case "auth-create":
    case "auth-join":
    case "auth-invite":
      await connect(action.slice(5));
      break;
    case "create":
      createForm();
      break;
    case "join":
      await joinHome();
      break;
    case "invite":
      inviteForm();
      break;
    case "refreshMembers":
      await fetchMembers();
      break;
    case "sync":
      await syncNow(true);
      break;
    case "delete":
      deleteTx();
      break;
    case "copy":
      txForm(
        s.rows.find((t) => t.id === draft.id),
        true,
      );
      break;
    case "prev":
      s.pg = Math.max(0, s.pg - 1);
      render();
      break;
    case "next":
      s.pg++;
      render();
      break;
    case "export":
      exportRows();
      break;
    case "updates":
      updates();
      break;
    case "signout": {
      modal(
        "Sign out?",
        `<p class="info">Your device keeps its local cache${s.pending ? ", including changes waiting to sync" : ""}. Sign back in with the same Google account to continue.</p>` +
          form("", "Sign out"),
        async () => {
          signOutGoogle();
          remember("profile", null);
          close();
          await loadAccount(null);
          navigate("overview");
          notify("Signed out.");
        },
      );
      break;
    }
  }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest(
    "[data-page],[data-act],[data-cat],[data-person],[data-month],[data-filter],[data-budget],[data-home],[data-tx],[data-txtype]",
  );
  if (!b || b.dataset.filter) return;
  e.preventDefault();
  if (committing) return;
  try {
    const d = b.dataset;
    if (d.page) navigate(d.page);
    else if (d.cat || d.person) {
      s.filters = {
        ...cleanFilters(),
        type: "expense",
        cat: d.cat || "",
        member: d.person || "",
      };
      s.pg = 0;
      navigate("transactions", false);
    } else if (d.tx) txForm(s.rows.find((t) => t.id === d.tx));
    else if (d.budget) showBudget(d.budget);
    else if (d.month) selectMonth(d.month);
    else if (d.home) {
      const home = s.homes.find((h) => h.id === d.home);
      if (home) {
        close();
        await openHome(home);
        navigate("overview");
      }
    } else if (d.txtype) {
      const f = new FormData(inner.querySelector("form"));
      Object.assign(draft, {
        type: d.txtype,
        title: f.get("title"),
        amountInput: f.get("amount"),
        date: f.get("date"),
        note: f.get("note"),
        category: f.get("category"),
      });
      drawTx();
    } else if (d.act) {
      b.disabled = true;
      try {
        await act(d.act);
      } finally {
        b.disabled = false;
      }
    }
  } catch (error) {
    showError(error);
  }
});
inner.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (committing || !saveHandler) return;
  const f = new FormData(e.target);
  committing = true;
  const btn = e.submitter;
  if (btn) btn.disabled = true;
  try {
    await saveHandler(f);
  } catch (error) {
    showError(error);
  } finally {
    committing = false;
    if (btn) btn.disabled = false;
  }
});
dialog.addEventListener("cancel", (e) => {
  if (committing) e.preventDefault();
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog && !committing) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      close();
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "breakdown-mode") {
    s.breakdown = el.value;
    render();
  }
  if (el.id === "trend-mode") {
    s.trend = el.value;
    render();
  }
  if (el.dataset.filter) {
    s.filters[el.dataset.filter] = el.value;
    s.pg = 0;
    render();
  }
  if (el.id === "budget-category") {
    const b = s.budgets.find(
      (b) => b.month === s.month && b.category === el.value,
    );
    inner.querySelector('[name="amount"]').value = b
      ? fromMinor(b.amount, s.home.currency)
      : "";
  }
  if (el.name === "title" && draft && !draft.id) {
    const last = s.rows.find(
      (t) =>
        t.title.toLowerCase() === el.value.trim().toLowerCase() &&
        t.type === draft.type,
    );
    if (last) inner.querySelector('[name="category"]').value = last.category;
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    s.filters.q = e.target.value;
    s.pg = 0;
    render();
  }
});
window.addEventListener("popstate", () =>
  navigate(safePage(location.hash.slice(1))),
);
window.addEventListener("online", () => scheduleSync(0));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && s.ledger) {
    readHead().catch(showError);
    scheduleSync(100);
  }
});
channel?.addEventListener("message", (e) => {
  if (e.data.home === s.home?.id && e.data.account === s.profile?.id)
    readHead().catch(showError);
});
setInterval(() => {
  if (
    !document.hidden &&
    navigator.onLine &&
    getGoogleSession() &&
    Date.now() >= retryAfter
  )
    scheduleSync(0);
}, 20000);
async function boot() {
  s.page = safePage(location.hash.slice(1));
  await loadAccount(s.profile);
  if (GOOGLE_CLIENT_ID) prepareGoogle(GOOGLE_CLIENT_ID).catch(() => {});
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
}
boot().catch((err) => {
  root.innerHTML = `<main class="loading"><h1>Unable to open Spendwell</h1><p>${esc(err.message)}</p><p>Enable browser storage and reload this page.</p><button class="btn" id="retry-start">Retry</button></main>`;
  document.querySelector("#retry-start").onclick = () => location.reload();
});
