# YOUTH ROBE Manifest & Gatepass

Browser-only app (no server, no database). One entry creates a branded **Dispatch Manifest** and a **Vehicle Gate Pass**
that share the same details (courier boy, vehicle, date/time, employee, logistics partner, Order IDs / AWBs).
Every record is saved as a file in a **separate private GitHub repo**, so it can be searched and downloaded again later
as PDF, and the whole history as Excel.

```
docs/            the website (code only, no data)  -> published with GitHub Pages
manifest-data/   PRIVATE repo, one JSON file per dispatch: data/2026-10/YR-20261029-001.json
```

## Why two repos
Records contain phone numbers and vehicle numbers, so they must live in a **private** repo.
GitHub Pages on the free plan only works from a **public** repo. So: this repo (public, code only) serves the page, and the
private `manifest-data` repo holds the data. Nobody can read data without a token that has access to `manifest-data`.
The app refuses to start if the data repo is public.

## One-time setup
1. **Create the data repo.** GitHub -> New repository -> name `manifest-data` -> **Private** -> add a README.
   (If you use another name, change `repo` in `docs/config.js`.)
2. **Publish the page.** This repo -> Settings -> Pages -> Deploy from a branch -> `main` and folder `/docs`.
   The address will be `https://aryanagrawal-yr.github.io/manifest/`.
3. **Create an access token for each person.** GitHub -> Settings -> Developer settings -> Personal access tokens ->
   Fine-grained tokens -> Generate:
   - Repository access: **Only select repositories -> manifest-data**
   - Permissions: **Contents: Read and write**
   - Give it a name like `manifest-<person>` and an expiry.
   Give each person their own token (revoke one token to remove one person). Keep tokens private; they are the login.
4. Open the page, paste the token, sign in.

Tokens are kept in the browser tab (session) unless "Remember on this device" is ticked. Use that only on a personal device.

## Daily use
- **+ New**: fill the form once and paste the AWB / Order IDs. Manifest and gatepass numbers are created automatically
  (`MF-YYYYMMDD-001`, `GP-YYYYMMDD-001`).
- Open a record to download either PDF, and to press **Mark entry now / Mark exit now** at the gate.
  Gate times can be set only once; the gatepass PDF shows them.
- **All records**: search by AWB, order id, courier, vehicle or manifest no; filter by partner or date;
  **Download full Excel** exports everything (Dispatches + Items sheets).
- If an AWB already appeared in an earlier manifest you get a warning (it still saves).

## Proof / audit trail
Every create and gate update is a Git commit in `manifest-data`, so the history of who changed what and when is kept by GitHub.

## Branding
Put a `logo.png` in `docs/` and it replaces the "YOUTH ROBE" text in the PDF header.

## Notes and limits
- PDFs use a standard Latin font: Hindi/other scripts in names would print as `?`. Use English spelling.
- Works well for thousands of records. All records are loaded when the page opens.
- Anyone whose token has write access to `manifest-data` can also edit files there directly (history is still kept).
