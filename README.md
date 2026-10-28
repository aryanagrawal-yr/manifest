# YOUTH ROBE Manifest & Gatepass

Browser-only app (no server, no database). One entry creates a branded **Pickup Manifest** and a **Vehicle Gate Pass**
that share the same details (courier boy, vehicle, date/time, employee, logistics partner, shipments with Order ID, AWB, boxes and weight).
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
- **+ New**: fill the form once and add each shipment (Order ID, AWB, Boxes, Weight kg) in the table, or paste rows from a sheet, or **scan barcodes**: click the scan box and scan with a USB / Bluetooth scanner (it types the code and presses Enter). Choose AWB, Order ID, or "Order ID, then its AWB" for pairs. A re-scanned code beeps and is flagged. On Android Chrome a "Scan with camera" button also appears. Manifest and gatepass numbers are created automatically
  (`MF-YYYYMMDD-001`, `GP-YYYYMMDD-001`).
- Open a record to download either PDF. In **Gate record**, pick the date and time of vehicle **entry** and **exit**
  (it starts at the current time) and press **Save entry time / Save exit time**. A time cannot be in the future,
  exit cannot be before entry, and each time is saved once (who saved it and when is logged). The gatepass PDF shows them.
- **All records**: search by AWB, order id, courier, vehicle or manifest no; filter by partner or date;
  **Download full Excel** exports everything (Dispatches + Items sheets).
- **Duplicate warning:** an Order ID / AWB that already appeared in an earlier manifest, or was typed twice in the same list, still saves but is flagged. Repeated rows are kept (not merged). The manifest PDF shows an amber WARNING box and highlights each row with a [DUPLICATE] tag; the gatepass shows a short warning; the record page and the Excel export mark them too. Only the manifests loaded in the app are checked, which is all records in `manifest-data`.

## Proof / audit trail
Every create and gate update is a Git commit in `manifest-data`, so the history of who changed what and when is kept by GitHub.

## Branding
Manifest PDF follows the supplied RobeHive design: **Colourful** and **Black & White** versions, each with 3 copies
(Vendor, RobeHive Logistics, Courier). Header, footer and copy names are in `docs/config.js` (`brand`); the Courier column shows the logistics partner.

## Notes and limits
- PDFs use a standard Latin font: Hindi/other scripts in names would print as `?`. Use English spelling.
- Works well for thousands of records. All records are loaded when the page opens.
- Anyone whose token has write access to `manifest-data` can also edit files there directly (history is still kept).

## Razzai World (Harda <> Indore trucks)

A second copy of the app lives at `docs/razzai/` (URL: `.../manifest/razzai/`). It is for truck trips between Harda and
Indore: one record per trip, **Route** = "Harda to Indore" or "Indore to Harda". Differences from the Youth Robe app:
route dropdown replaces logistics partner, a **Seal number** field is added, entry/exit become **Departed from origin /
Arrived at destination**, "courier" becomes "driver", (Youth Robe red theme, Razzai World named as the logistics partner). Records are stored in their own
private repo `razzai-manifest-data` (separate from Youth Robe, so tokens for one cannot open the other), numbered `RW-YYYYMMDD-NNN`. Branding text, copy names and
routes are in `docs/razzai/config.js`.
