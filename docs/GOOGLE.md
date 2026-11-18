# Spendwell Google setup

Each household has one ledger in the creator's Google Drive. Family members use their own Google accounts to read and edit that ledger. Their browsers cache a copy locally for fast access. The Drive file counts toward the owner's available storage. Personal Google accounts generally include 15 GB shared across Drive, Gmail and Photos. [Google storage details](https://support.google.com/drive/answer/6374270)

## Configure a deployment

1. Create a project in Google Cloud Console. Enable **Google Drive API**, **Google Sheets API** and **Google Picker API**. Drive manages ownership and permissions. Sheets stores the transactions, and Picker lets an invited member open a household. [Enable Workspace APIs](https://developers.google.com/workspace/guides/enable-apis)
2. Configure your app name, contact details and audience in **Google Auth Platform**. For an external app in testing, add your family's Google accounts as test users. Configure the scopes `openid`, `email`, `profile` and `https://www.googleapis.com/auth/drive.file`. For a public launch, complete Google's applicable publishing and branding requirements. [OAuth consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent)
3. Create an OAuth client of type **Web application**. Under **Authorized JavaScript origins**, enter your deployed origin, such as `https://YOUR-NAME.github.io`. Omit the repository path. Add the exact development origin separately, such as `http://localhost:8000`. The popup flow uses the public client ID. [Google authorization](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
4. Create a browser API key in the same project. Restrict the key to the deployed and development HTTP referrers and restrict API access to **Google Picker API**. Copy the project's numeric **Project number** from the Cloud Console project settings. [Google Picker setup](https://developers.google.com/workspace/drive/picker/guides/web-picker)
5. In `dist/config.js`, set `GOOGLE_CLIENT_ID` to the web client ID, `GOOGLE_API_KEY` to the restricted Picker key and `GOOGLE_APP_ID` to the project number as a string. Publish the updated files. These three values are public browser configuration. Keep OAuth client secrets and access tokens out of the repository.
6. Open Spendwell and connect your Google account. The app gets your stable account ID from Google and keeps its short-lived authorization token in memory. Reconnect after a reload or token expiry to resume cloud sync. [Google Identity token flow](https://developers.google.com/identity/oauth2/web/guides/use-token-model)

## Use the household on multiple devices

- The owner creates a household in Spendwell. The app creates **Spendwell · HOUSEHOLD NAME** in that account's Drive. A user can belong to several households, each with its own ledger.
- From **Members → Invite member**, the owner invites each family member's Google email address. Google grants editor access to the file and emails the invite. A recipient connects the invited account to the same Spendwell deployment, chooses to join a household, and selects the shared file in Google Picker.
- On another device, sign in to the same deployment with the same Google account. The household list discovers owner-created and previously authorized files. Use Picker to select a new invitation.
- Manage or revoke permissions in the file's Drive **Share** dialog. Removing access stops future cloud reads and writes. Copies already delivered to a member's browser remain on that device. Workspace administrators can restrict sharing outside their organization. [Drive sharing permissions](https://developers.google.com/workspace/drive/api/guides/manage-sharing)

## Storage, speed and recovery

An edit commits to the account's IndexedDB cache before network sync. Each sync pulls rows added since the last completed batch and appends queued changes. It encodes changes as compact arrays, compresses them with gzip when that saves space, and groups them into batches before making requests. The owner and participants all append to the same ledger.

Each event carries a stable ID and a logical timestamp. A dropped acknowledgment or interrupted page load leaves the local queue intact. On reconnect, replaying the remote batch acknowledges its events and ignores duplicates. Independent edits survive concurrent appends. When two people edit the same record, the highest logical timestamp wins, with the event ID breaking a tie. A first-time device reads the full ledger. [Sheets append API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append)

Sync in an open, connected tab before clearing browser storage. Local changes that have not yet synced live on that device. An expired token, access revocation or Google quota error leaves queued writes in place for retry. Keep the sheet's **Ledger** tab, row order and encoded cells intact. Drive's version history can restore a sheet that someone has edited manually. Google Sheets file limits, Drive storage and service quotas apply. [Google file limits](https://support.google.com/drive/answer/37603) · [Sheets API usage limits](https://developers.google.com/workspace/sheets/api/limits)

## Check the deployment

- Connect an owner account, create a household and log an expense. Sync, then use a different browser profile with the same account to verify the expense appears once.
- Invite a second account, join via Picker and add a transaction on each device. Sync both and compare the totals. In Drive, verify that the original creator owns the household sheet.
- Edit offline, restore the connection and sync. Refresh and reconnect to verify the edit. Switch accounts and verify that the device opens that account's own household list.
- If Google reports an origin mismatch, compare the address bar's scheme, hostname and port with the OAuth client origins. If Picker fails, check the API key's referrers, allowed API and project number.
