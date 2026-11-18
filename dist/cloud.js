// The public Google client identifies this deployment. Access tokens live in memory.
const DRIVE = "https://www.googleapis.com/drive/v3";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
const SCOPES = "openid email profile " + DRIVE_FILE;
const FORMAT = "spendwell-household-v1";
const scripts = new Map();
const databases = new Map();
const syncs = new Map();
let session = null;
let loginVersion = 0;

function loadScript(url, isReady) {
  if (isReady()) return Promise.resolve();
  if (!scripts.has(url)) {
    const task = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const fail = () => {
        clearTimeout(timeout);
        script.remove();
        reject(
          new Error(
            "Google could not load. Check your connection and try again.",
          ),
        );
      };
      const timeout = setTimeout(fail, 18000);
      script.onload = () => {
        clearTimeout(timeout);
        if (isReady()) resolve();
        else fail();
      };
      script.onerror = fail;
      script.src = url;
      script.async = true;
      document.head.append(script);
    }).catch((error) => {
      scripts.delete(url);
      throw error;
    });
    scripts.set(url, task);
  }
  return scripts.get(url);
}

export async function prepareGoogle(clientId) {
  if (!clientId)
    throw new Error("Add a Google OAuth client ID to connect Google Drive.");
  await loadScript(
    "https://accounts.google.com/gsi/client",
    () => window.google?.accounts?.oauth2,
  );
}

export async function signInGoogle(clientId) {
  await prepareGoogle(clientId);
  const version = ++loginVersion;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      include_granted_scopes: true,
      error_callback: () =>
        reject(new Error("Google sign-in closed. You can try again.")),
      callback: async (response) => {
        try {
          if (response.error || !response.access_token)
            throw new Error(
              response.error_description || "Google sign-in failed.",
            );
          if (
            !google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_FILE)
          ) {
            throw new Error(
              "Allow access to the Drive files you use with Spendwell.",
            );
          }
          const reply = await fetch(
            "https://openidconnect.googleapis.com/v1/userinfo",
            {
              headers: { Authorization: "Bearer " + response.access_token },
              cache: "no-store",
            },
          );
          if (!reply.ok)
            throw new Error(
              "Google could not verify this account. Reconnect to try again.",
            );
          const { sub, name, email, picture } = await reply.json();
          if (!sub || !email || version !== loginVersion)
            throw new Error("Sign-in expired. Please reconnect.");
          const profile = { id: sub, name: name || email, email, picture };
          session = {
            profile,
            token: response.access_token,
            expires: Date.now() + Number(response.expires_in) * 1000,
          };
          resolve({ ...profile });
        } catch (error) {
          reject(error);
        }
      },
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}

export function signOutGoogle() {
  loginVersion++;
  session = null;
}
export function getGoogleSession() {
  return session && session.expires > Date.now() + 3000
    ? { ...session.profile }
    : null;
}

function requireSession(account) {
  if (
    !session ||
    session.profile.id !== account ||
    session.expires <= Date.now() + 3000
  ) {
    throw new Error(
      "Reconnect your Google account to sync. Changes are saved on this device.",
    );
  }
  return session;
}

async function request(account, url, options = {}, accepted = []) {
  const current = requireSession(account);
  const answer = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: { Authorization: "Bearer " + current.token, ...options.headers },
  });
  if (current !== session) throw new Error("Account changed. Sync stopped.");
  if (answer.ok || accepted.includes(answer.status)) return answer;
  if (answer.status === 401) {
    current.expires = 0;
    throw new Error(
      "Google authorization expired. Reconnect to sync your saved changes.",
    );
  }
  const details = await answer.json().catch(() => ({}));
  const error = new Error(
    details.error?.message ||
      "Google sync failed (" + answer.status + "). Please retry.",
  );
  error.status = answer.status;
  throw error;
}

function query(endpoint, params) {
  return endpoint + "?" + new URLSearchParams(params);
}
const jsonBody = (method, data) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

function result(req) {
  return new Promise((yes, no) => {
    req.onsuccess = () => yes(req.result);
    req.onerror = () => no(req.error);
  });
}
async function run(db, names, mode, work) {
  const tx = db.transaction(names, mode);
  const done = new Promise((yes, no) => {
    tx.oncomplete = yes;
    tx.onabort = () =>
      no(tx.error || new Error("The ledger update was interrupted."));
    tx.onerror = () => {};
  });
  const stores = Object.fromEntries(
    names.map((name) => [name, tx.objectStore(name)]),
  );
  try {
    const value = await work(stores);
    await done;
    return value;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Already completed or aborted. */
    }
    await done.catch(() => {});
    throw error;
  }
}

function database(account) {
  if (!databases.has(account)) {
    const req = indexedDB.open(
      "spendwell.households.v1." +
        new URL(".", import.meta.url).pathname +
        ":" +
        account,
      1,
    );
    req.onupgradeneeded = () => {
      const db = req.result;
      const heads = db.createObjectStore("heads", {
        keyPath: ["household", "kind", "key"],
      });
      heads.createIndex("household", "household");
      const outbox = db.createObjectStore("outbox", { keyPath: "id" });
      outbox.createIndex("household", "household");
      db.createObjectStore("homes", { keyPath: "id" });
      db.createObjectStore("meta");
    };
    const ready = result(req)
      .then((db) => {
        db.onversionchange = () => {
          db.close();
          databases.delete(account);
        };
        return db;
      })
      .catch((error) => {
        databases.delete(account);
        throw error;
      });
    databases.set(account, ready);
  }
  return databases.get(account);
}

const validString = (value) => typeof value === "string" && value.length > 0;
function checkEvent(event) {
  if (
    !event ||
    !validString(event.id) ||
    !Number.isSafeInteger(event.ts) ||
    event.ts < 1 ||
    !validString(event.kind) ||
    !validString(event.key) ||
    event.value === undefined
  ) {
    throw new Error("The ledger contains an unreadable event.");
  }
}
function wins(event, old) {
  return (
    !old || event.ts > old.ts || (event.ts === old.ts && event.id > old.id)
  );
}
const tuple = ({ id, ts, kind, key, value }) => [id, ts, kind, key, value];
function untuple(row) {
  if (!Array.isArray(row) || row.length !== 5)
    throw new Error("Unsupported ledger format.");
  const [id, ts, kind, key, value] = row;
  const event = { id, ts, kind, key, value };
  checkEvent(event);
  return event;
}

async function pack(events) {
  const raw = new Blob([JSON.stringify(events.map(tuple))], {
    type: "application/json",
  });
  if (typeof CompressionStream === "undefined") return raw;
  const zipped = await new Response(
    raw.stream().pipeThrough(new CompressionStream("gzip")),
  ).blob();
  return Math.ceil(zipped.size / 3) * 4 < raw.size
    ? new Blob([zipped], { type: "application/gzip" })
    : raw;
}
async function unpack(blob, gzip) {
  if (gzip && typeof DecompressionStream === "undefined")
    throw new Error("Update this browser to read compressed Drive records.");
  const stream = gzip
    ? blob.stream().pipeThrough(new DecompressionStream("gzip"))
    : blob.stream();
  const rows = await new Response(stream).json();
  if (!Array.isArray(rows)) throw new Error("Unsupported ledger format.");
  return rows.map(untuple);
}
const sheetURL = (sheet, range) =>
  SHEETS +
  "/" +
  encodeURIComponent(sheet) +
  "/values/" +
  encodeURIComponent(range);
const sheetRange = "Ledger!A:D";
function base64(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 8192)
    parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(parts.join(""));
}
async function encodeRows(events) {
  const blob = await pack(events);
  const data =
    blob.type === "application/gzip"
      ? "g" + base64(new Uint8Array(await blob.arrayBuffer()))
      : "j" + (await blob.text());
  const id = crypto.randomUUID();
  // Keep each Sheets cell below its text limit and all chunks inside a single atomic append.
  const chunks = [];
  for (let offset = 0; offset < data.length; ) {
    let end = Math.min(offset + 40000, data.length);
    if (end < data.length && /[\uD800-\uDBFF]/.test(data[end - 1])) end--;
    chunks.push(data.slice(offset, end));
    offset = end;
  }
  return chunks.map((part, index) => [id, index, chunks.length, part]);
}
async function decodeRows(parts) {
  const data = parts.join("");
  if (!["g", "j"].includes(data[0]))
    throw new Error("Unsupported shared ledger encoding.");
  const compressed = data[0] === "g";
  const content = compressed
    ? Uint8Array.from(atob(data.slice(1)), (c) => c.charCodeAt(0))
    : data.slice(1);
  return unpack(new Blob([content]), compressed);
}

async function chooseSheet(account, { apiKey, appId }) {
  if (!apiKey || !appId)
    throw new Error(
      "Set the Google Picker API key and Cloud project number to join a household.",
    );
  await loadScript(
    "https://apis.google.com/js/api.js",
    () => window.gapi?.load,
  );
  await new Promise((resolve, reject) =>
    gapi.load("picker", {
      callback: resolve,
      onerror: () => reject(new Error("Google Picker could not load.")),
      timeout: 15000,
      ontimeout: () => reject(new Error("Google Picker timed out.")),
    }),
  );
  const active = requireSession(account);
  return new Promise((resolve, reject) => {
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS);
    const picker = new google.picker.PickerBuilder()
      .setAppId(String(appId))
      .setDeveloperKey(apiKey)
      .setOAuthToken(active.token)
      .setOrigin(location.origin)
      .setTitle("Choose a Spendwell household")
      .addView(view)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          picker.dispose();
          resolve(data.docs[0].id);
        } else if (data.action === google.picker.Action.CANCEL) {
          picker.dispose();
          reject(new Error("No shared ledger selected."));
        }
      })
      .build();
    picker.setVisible(true);
  });
}

function withLock(account, household, action) {
  // Web Locks serialize all tabs. In a browser without Web Locks, require modern browser for cloud writes.
  if (!navigator.locks)
    throw new Error(
      "Open this app over HTTPS in a current browser to sync Google Drive.",
    );
  return navigator.locks.request(
    "spendwell-sync:" + account + ":" + household,
    action,
  );
}

async function grantAccess(account, sheet, email) {
  await request(
    account,
    query(DRIVE + "/files/" + encodeURIComponent(sheet) + "/permissions", {
      sendNotificationEmail: "true",
      fields: "id",
    }),
    jsonBody("POST", { type: "user", role: "writer", emailAddress: email }),
  );
}

const demo = {
  id: "demo",
  name: "Sample household",
  currency: "INR",
  ownerId: "local",
  role: "owner",
};
const getHome = (db, id) =>
  run(db, ["homes"], "readonly", (s) => result(s.homes.get(id)));
const readMeta = (db, key) =>
  run(db, ["meta"], "readonly", (s) => result(s.meta.get(key)));

function checkHousehold(name, currency) {
  if (!validString(name?.trim()) || !/^[A-Z]{3}$/.test(currency))
    throw new Error("Enter a household name and a three-letter currency.");
}
function roleOf(file) {
  return file.owners?.some((owner) => owner.me)
    ? "owner"
    : file.capabilities?.canEdit
      ? "editor"
      : "viewer";
}
async function remember(db, home) {
  await run(db, ["homes"], "readwrite", (s) => s.homes.put(home));
  return home;
}
async function listHomes(db, account) {
  if (account === "local") return [demo];
  // Read from the account cache offline. On first use the directory comes from per-file Drive grants.
  if (session?.profile.id === account && navigator.onLine !== false) {
    try {
      let page = "";
      do {
        const params = {
          q:
            "trashed=false and appProperties has { key='format' and value='" +
            FORMAT +
            "' }",
          fields:
            "nextPageToken,files(id,name,owners(me),capabilities(canEdit),appProperties)",
          pageSize: "1000",
        };
        if (page) params.pageToken = page;
        const files = await (
          await request(account, query(DRIVE + "/files", params))
        ).json();
        await run(db, ["homes"], "readwrite", (s) => {
          for (const file of files.files || []) {
            const { ownerId, currency } = file.appProperties;
            s.homes.put({
              id: file.id,
              name: file.name.replace(/^Spendwell · /, ""),
              ownerId,
              currency,
              role: roleOf(file),
            });
          }
        });
        page = files.nextPageToken;
      } while (page);
    } catch (error) {
      const cached = await run(db, ["homes"], "readonly", (s) =>
        result(s.homes.count()),
      );
      if (!cached) throw error;
    }
  }
  return run(db, ["homes"], "readonly", (s) => result(s.homes.getAll()));
}

async function createHome(db, account, name, currency) {
  requireSession(account);
  checkHousehold(name, currency);
  name = name.trim();
  // Drive creates the file and its discovery metadata together. If initialization is interrupted,
  // the owner can recover the empty file on their next sync using those properties.
  const file = await (
    await request(
      account,
      query(DRIVE + "/files", { fields: "id" }),
      jsonBody("POST", {
        name: "Spendwell · " + name,
        mimeType: "application/vnd.google-apps.spreadsheet",
        writersCanShare: false,
        appProperties: { format: FORMAT, ownerId: account, currency },
      }),
    )
  ).json();
  const home = await remember(db, {
    id: file.id,
    name,
    currency,
    ownerId: account,
    role: "owner",
  });
  await initializeSheet(account, home);
  return home.id;
}

async function initializeSheet(account, home) {
  const doc = await (
    await request(
      account,
      query(SHEETS + "/" + encodeURIComponent(home.id), {
        fields:
          "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",
      }),
    )
  ).json();
  if (doc.sheets.some((s) => s.properties.title === "Ledger")) return;
  if (home.role !== "owner" || doc.sheets.length !== 1)
    throw new Error(
      "The household ledger needs its owner to restore the Ledger tab.",
    );
  const initial = doc.sheets[0].properties;
  // Check for a pristine sheet before initializing it. Renamed ledgers must never be overwritten.
  const first = await (
    await request(
      account,
      sheetURL(home.id, "'" + initial.title.replaceAll("'", "''") + "'!A1:D1"),
    )
  ).json();
  if (first.values?.length)
    throw new Error(
      "Rename the household data tab back to Ledger in Google Sheets.",
    );
  const sheetId = initial.sheetId;
  await request(
    account,
    SHEETS + "/" + encodeURIComponent(home.id) + ":batchUpdate",
    jsonBody("POST", {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, title: "Ledger" },
            fields: "title",
          },
        },
        {
          updateCells: {
            start: { sheetId, rowIndex: 0, columnIndex: 0 },
            rows: [
              {
                values: [FORMAT, home.ownerId, home.name, home.currency].map(
                  (stringValue) => ({ userEnteredValue: { stringValue } }),
                ),
              },
            ],
            fields: "userEnteredValue",
          },
        },
      ],
    }),
  );
}

async function writeEvents(db, account, homeId, changes) {
  if (!Array.isArray(changes))
    throw new Error("Supply a list of household changes.");
  if (account === "local" && homeId !== demo.id)
    throw new Error("Connect Google to create a household.");
  return run(
    db,
    ["homes", "heads", "outbox", "meta"],
    "readwrite",
    async (s) => {
      const home =
        account === "local" ? demo : await result(s.homes.get(homeId));
      if (!home) throw new Error("Open or create this household first.");
      if (home.role === "viewer")
        throw new Error("Request editor access from the household owner.");
      let clock = (await result(s.meta.get("clock:" + homeId))) || 0;
      const added = [];
      for (const { kind, key, value } of changes) {
        clock = Math.max(Date.now(), clock + 1);
        const event = { id: crypto.randomUUID(), ts: clock, kind, key, value };
        checkEvent(event);
        // Store only the JSON data that will actually round-trip through Sheets.
        const stored = {
          ...event,
          value: JSON.parse(JSON.stringify(value)),
          household: homeId,
        };
        s.heads.put(stored);
        if (account !== "local") s.outbox.add(stored);
        added.push(stored);
      }
      s.meta.put(clock, "clock:" + homeId);
      return added;
    },
  );
}

function takeBatch(events) {
  let bytes = 0;
  const batch = [];
  for (const event of events) {
    const size = JSON.stringify(tuple(event)).length * 2;
    if (batch.length && bytes + size > 384 * 1024) break;
    batch.push(event);
    bytes += size;
  }
  return batch;
}

async function ingest(db, household, events, nextRow) {
  await run(db, ["heads", "outbox", "meta"], "readwrite", async (s) => {
    let clock = (await result(s.meta.get("clock:" + household))) || 0;
    for (const event of events) {
      const old = await result(s.heads.get([household, event.kind, event.key]));
      if (wins(event, old)) s.heads.put({ ...event, household });
      // A matching own event can arrive here after a successful append with a lost acknowledgment.
      const pending = await result(s.outbox.get(event.id));
      if (pending?.household === household) s.outbox.delete(event.id);
      clock = Math.max(clock, event.ts);
    }
    s.meta.put(clock, "clock:" + household);
    s.meta.put(nextRow, "row:" + household);
  });
}

async function readPage(account, home, row) {
  const page = (start, end) =>
    request(account, sheetURL(home.id, "Ledger!A" + start + ":D" + end)).then(
      (r) => r.json(),
    );
  try {
    return await page(row, row + 127);
  } catch (error) {
    if (error.status !== 400) throw error;
    // Some Sheets implementations reject requests crossing the current grid boundary.
    const data = await (
      await request(
        account,
        query(SHEETS + "/" + encodeURIComponent(home.id), {
          fields: "sheets(properties(title,gridProperties(rowCount)))",
        }),
      )
    ).json();
    const tab = data.sheets.find((s) => s.properties.title === "Ledger");
    if (!tab) {
      await initializeSheet(account, home);
      return page(row, row + 127);
    }
    const limit = tab.properties.gridProperties.rowCount;
    if (row > limit) return {};
    if (row + 127 > limit) return page(row, limit);
    throw error;
  }
}
async function pull(db, account, home) {
  let row = (await readMeta(db, "row:" + home.id)) || 2;
  let parts = [],
    batchId,
    expected;
  let count = 0;
  for (;;) {
    const { values: rows = [] } = await readPage(account, home, row);
    for (const [batch, index, total, part] of rows) {
      if (!parts.length) {
        batchId = batch;
        expected = Number(total);
      }
      if (
        !validString(batch) ||
        batch !== batchId ||
        Number(index) !== parts.length ||
        Number(total) !== expected ||
        !Number.isSafeInteger(expected) ||
        expected < 1 ||
        !validString(part)
      ) {
        throw new Error(
          "The household ledger has a modified row. Ask its owner to restore the sheet.",
        );
      }
      parts.push(part);
      row++;
      if (parts.length === expected) {
        const events = await decodeRows(parts);
        await ingest(db, home.id, events, row);
        count += events.length;
        parts = [];
      }
    }
    if (rows.length < 128) break;
  }
  if (parts.length)
    throw new Error(
      "The household ledger has an incomplete batch. Retry sync.",
    );
  return count;
}

async function push(db, account, home) {
  let count = 0;
  for (;;) {
    const queued = await run(db, ["outbox"], "readonly", (s) =>
      result(s.outbox.index("household").getAll(home.id, 128)),
    );
    const batch = takeBatch(queued);
    if (!batch.length) return count;
    const rows = await encodeRows(batch);
    const response = await (
      await request(
        account,
        sheetURL(home.id, sheetRange) +
          ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
        jsonBody("POST", { values: rows }),
      )
    ).json();
    await run(db, ["outbox", "meta"], "readwrite", async (s) => {
      const next = (await result(s.meta.get("row:" + home.id))) || 2;
      const added = response.updates?.updatedRange?.match(/!A(\d+):D(\d+)$/);
      // Skip re-downloading our own rows only when there was no intervening remote append.
      if (
        added &&
        Number(added[1]) === next &&
        Number(added[2]) === next + rows.length - 1
      ) {
        s.meta.put(next + rows.length, "row:" + home.id);
      }
      batch.forEach((event) => s.outbox.delete(event.id));
    });
    count += batch.length;
  }
}

export async function openLedger(account = "local") {
  if (!validString(account)) throw new Error("Missing ledger account.");
  const db = await database(account);
  return {
    createHousehold: (name, currency) =>
      createHome(db, account, name, currency),
    listHouseholds: () => listHomes(db, account),
    all: (household) => {
      if (!validString(household)) throw new Error("Choose a household.");
      return run(db, ["heads"], "readonly", (s) =>
        result(s.heads.index("household").getAll(household)),
      );
    },
    put: async (kind, key, value, household) =>
      (await writeEvents(db, account, household, [{ kind, key, value }]))[0],
    putMany: (changes, household) =>
      writeEvents(db, account, household, changes),
    pending: (household) => {
      if (!validString(household)) throw new Error("Choose a household.");
      return run(db, ["outbox"], "readonly", (s) =>
        result(s.outbox.index("household").count(household)),
      );
    },
    members: async (id) => {
      if (account === "local" && id === demo.id)
        return [{ name: "You", email: "", role: "owner" }];
      const people = [];
      let page = "";
      do {
        const params = {
          fields:
            "nextPageToken,permissions(type,displayName,emailAddress,role,deleted)",
          pageSize: "100",
        };
        if (page) params.pageToken = page;
        const reply = await (
          await request(
            account,
            query(
              DRIVE + "/files/" + encodeURIComponent(id) + "/permissions",
              params,
            ),
          )
        ).json();
        for (const permission of reply.permissions || []) {
          if (
            !permission.deleted &&
            ["user", "group"].includes(permission.type)
          )
            people.push({
              name:
                permission.displayName ||
                permission.emailAddress ||
                "Household member",
              email: permission.emailAddress || "",
              role:
                permission.role === "owner"
                  ? "owner"
                  : permission.role === "writer"
                    ? "editor"
                    : "viewer",
            });
        }
        page = reply.nextPageToken;
      } while (page);
      return people.sort(
        (a, b) =>
          Number(b.role === "owner") - Number(a.role === "owner") ||
          a.name.localeCompare(b.name),
      );
    },
    invite: async (id, email) => {
      const home = await getHome(db, id);
      if (home?.role !== "owner")
        throw new Error("Ask the household owner to invite members.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        throw new Error("Enter a valid email address.");
      await grantAccess(account, id, email.trim());
    },
    joinGroup: async (options) => {
      const id = await chooseSheet(account, options);
      const file = await (
        await request(
          account,
          query(DRIVE + "/files/" + encodeURIComponent(id), {
            fields:
              "id,name,trashed,owners(me),capabilities(canEdit),appProperties",
          }),
        )
      ).json();
      if (file.trashed || file.appProperties?.format !== FORMAT)
        throw new Error("Choose a household file created by Spendwell.");
      const header = await (
        await request(account, sheetURL(id, "Ledger!A1:D1"))
      ).json();
      const [marker, ownerId, name, currency] = header.values?.[0] || [];
      if (
        marker !== FORMAT ||
        !validString(ownerId) ||
        ownerId !== file.appProperties.ownerId
      ) {
        throw new Error("Choose a valid Spendwell household ledger.");
      }
      checkHousehold(name, currency);
      const home = await remember(db, {
        id,
        name,
        currency,
        ownerId,
        role: roleOf(file),
      });
      await withLock(account, id, () => pull(db, account, home));
      return home;
    },
    sync: (household) => {
      requireSession(account);
      if (!validString(household))
        throw new Error("Choose a household to sync.");
      const key = account + ":" + household;
      if (!syncs.has(key)) {
        const task = withLock(account, household, async () => {
          const home = await getHome(db, household);
          if (!home) throw new Error("Open this household first.");
          const downloaded = await pull(db, account, home);
          const uploaded = await push(db, account, home);
          return { uploaded, downloaded };
        }).finally(() => syncs.delete(key));
        syncs.set(key, task);
      }
      return syncs.get(key);
    },
  };
}
