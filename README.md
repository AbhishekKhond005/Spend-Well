# Spendwell

A phone-first household finance tracker that runs on GitHub Pages. Record an expense or income, see monthly totals, and tap a category to inspect the transactions behind its spending. Sign in with Google, then create a household or join one shared with you.

## Run locally

From the project directory, run the following command and visit **http://localhost:8000**.

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

The app uses plain JavaScript modules, a self-hosted font, and SVG charts. It has no runtime package dependencies or build step.

## Publish on GitHub Pages

1. Put the project in a GitHub repository with a `main` branch. Include `.github/workflows/pages.yml` and `dist/`.
2. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. Complete the Google setup below and add the three public settings in **Settings → Secrets and variables → Actions → Variables**.
4. In Google Auth Platform, set the app audience to **External** and publish the OAuth app to remove the test-user allowlist. See the Google setup guide below.
5. Push to `main` or run **Deploy Spendwell to GitHub Pages** in the Actions tab. The workflow tests the finance calculations, applies your Google configuration, and deploys only `dist/`. Open the deployment URL reported by GitHub.

Relative asset paths and hash navigation support deployment under a repository path. [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Set up Google access

Enable Drive, Sheets, and Picker APIs in one Cloud project. Register a Web OAuth client for your site's origin. Supply its client ID as `GOOGLE_CLIENT_ID`, the restricted browser Picker key as `GOOGLE_API_KEY`, and the numeric project number as `GOOGLE_APP_ID`. The site host configures these values once. Household users then connect their own Google accounts. For local testing, put the public values in `dist/config.js`.

The Google guide includes authorized origins, consent settings, test users, API key restrictions, and a two-account verification procedure. [Google setup guide](docs/GOOGLE.md)

## Track a household

- **Create the ledger.** Sign in with the Google account that should own the data. Choose **Create household**, enter a name and select the household currency. Spendwell creates a Google Sheet in that account’s Drive.
- **Add another person.** Open **Members → Invite member** and enter their Google email. They open the same Spendwell site, connect the invited account, and select the ledger under **Join shared household**.
- **Log transactions.** Tap **Add**, choose Expense or Income, enter the amount and description, and save. The form remembers the last expense category. Selecting a previously used description suggests its category. Open a transaction to edit, duplicate, or delete it.
- **Review spending.** Switch months, group spending by category or household member, tap a donut segment to inspect its transactions, compare daily and weekly trends, or filter transactions by description, type, member and category. Export the filtered results to CSV.
- **Set limits.** Add monthly spending limits by category. The bell shows categories at or above 80% of budget.
- **Use it on a phone.** Add the site to the home screen from the browser menu. After the first online visit, its cached interface and local ledger work offline. Google sign-in, household creation, invitations and cloud sync require a connection.

## Storage and synchronization

Each household uses one owner-held Google Sheet, shared with invited Google accounts. Each edit commits to IndexedDB first. The app appends compact change batches, compresses batches when beneficial, and pulls only new rows after the initial download. An open, connected tab syncs after edits, on return to the app, and about every 20 seconds. Duplicate events are idempotent. Concurrent edits to different transactions survive, and the most recent logical edit wins when devices change the same record.

The app sets no daily or lifetime transaction cap. Google's available account storage, Sheets file limits and API quotas still apply. Google's free storage is shared with other Google services. Use Drive's sharing controls to revoke access. Changes awaiting upload live in the device cache until sync succeeds. [Google storage](https://support.google.com/googleone/answer/9312312) · [Sheets limits](https://support.google.com/drive/answer/37603)

## Verify

```sh
npm test
node tests/browser.mjs
```

The browser suite uses Node 22 or newer and a local Chrome executable. Set `CHROME_BIN` if Chrome has a different executable name. It starts a temporary loopback server and a disposable browser profile. It exercises mobile and desktop layouts, transaction editing, persistence, budgets and category filtering. Shared household tests use native browser storage and simulated Google API responses. Live verification requires two consenting Google accounts and the deployment’s OAuth settings.
