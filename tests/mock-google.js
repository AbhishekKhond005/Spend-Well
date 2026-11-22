export function mockGoogle() {
  const sheets = new Map();
  let n = 0,
    picked,
    who = "alice",
    failAfterUpload = false,
    denied = false;
  const ok = (v, status = 200) => Response.json(v, { status });
  globalThis.google = {
    accounts: {
      oauth2: {
        hasGrantedAllScopes: () => true,
        initTokenClient: (opts) => ({
          requestAccessToken: () =>
            opts.callback({ access_token: who, expires_in: 3600 }),
        }),
      },
    },
    picker: {
      DocsView: class {
        setOwnedByMe() {}
      },
      ViewId: { SPREADSHEETS: 1 },
      Action: { PICKED: 1, CANCEL: 2 },
      PickerBuilder: class {
        setAppId() {
          return this;
        }
        setDeveloperKey() {
          return this;
        }
        setOAuthToken() {
          return this;
        }
        setOrigin() {
          return this;
        }
        setTitle() {
          return this;
        }
        addView() {
          return this;
        }
        setCallback(cb) {
          this.cb = cb;
          return this;
        }
        build() {
          return this;
        }
        dispose() {}
        setVisible() {
          this.cb({ action: 1, docs: [{ id: picked }] });
        }
      },
    },
  };
  globalThis.gapi = { load: (k, o) => o.callback() };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (resource, opts = {}) => {
    const url = new URL(resource, location.href),
      p = decodeURIComponent(url.pathname);
    if (!opts.headers?.Authorization) return realFetch(resource, opts);
    const user = opts.headers.Authorization.slice(7);
    const fileJSON = (file) => ({
      id: file.id,
      name: file.name,
      appProperties: file.appProperties,
      owners: [{ me: file.owner === user }],
      capabilities: { canEdit: file.users.includes(user) },
    });
    if (p === "/v1/userinfo")
      return ok({ sub: user, name: user, email: user + "@example.com" });
    if (p === "/drive/v3/files" && opts.method === "POST") {
      const body = JSON.parse(opts.body),
        id = "household-" + ++n;
      sheets.set(id, {
        ...body,
        id,
        owner: user,
        users: [user],
        tab: "Sheet1",
        rows: [],
      });
      return ok({ id });
    }
    if (p === "/drive/v3/files")
      return ok({
        files: [...sheets.values()]
          .filter((f) => f.users.includes(user))
          .map(fileJSON),
      });
    if (p.includes("/drive/v3/files/")) {
      const file = sheets.get(p.split("/")[4]);
      if (!file?.users.includes(user))
        return ok({ error: { message: "Access revoked" } }, 403);
      if (p.endsWith("/permissions") && opts.method === "POST") {
        const email = JSON.parse(opts.body).emailAddress;
        file.users.push(email.split("@")[0]);
        return ok({ id: email });
      }
      if (p.endsWith("/permissions"))
        return ok({
          permissions: file.users.map((id) => ({
            type: "user",
            displayName: id,
            emailAddress: id + "@example.com",
            role: id === file.owner ? "owner" : "writer",
          })),
        });
      return ok(fileJSON(file));
    }
    if (p.includes("/v4/spreadsheets/")) {
      const [, , , id, , range] = p.split("/");
      const sheet = sheets.get(id.replace(":batchUpdate", ""));
      if (!sheet?.users.includes(user) || denied)
        return ok({ error: { message: "Access revoked" } }, 403);
      if (id.endsWith(":batchUpdate")) {
        const optsJSON = JSON.parse(opts.body);
        sheet.tab = "Ledger";
        sheet.rows = [
          optsJSON.requests[1].updateCells.rows[0].values.map(
            (v) => v.userEnteredValue.stringValue,
          ),
        ];
        return ok({});
      }
      if (!range)
        return ok({
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: sheet.tab,
                gridProperties: {
                  rowCount: Math.max(1000, sheet.rows.length),
                },
              },
            },
          ],
        });
      if (range.endsWith(":append")) {
        const rows = JSON.parse(opts.body).values,
          start = sheet.rows.length + 1;
        sheet.rows.push(...rows);
        if (failAfterUpload) {
          failAfterUpload = false;
          throw new TypeError("network interrupted");
        }
        return ok({
          updates: {
            updatedRange: "Ledger!A" + start + ":D" + (start + rows.length - 1),
          },
        });
      }
      const [, start, end] = range.match(/A(\d+):[BD](\d+)/);
      return ok({ values: sheet.rows.slice(Number(start) - 1, Number(end)) });
    }
    throw new Error("Unexpected: " + p);
  };
  return {
    sheets,
    selectAccount: (user) => {
      who = user;
    },
    selectFile: (id) => {
      picked = id;
    },
    interruptUpload: () => {
      failAfterUpload = true;
    },
    denyAccess: (value) => {
      denied = value;
    },
  };
}
