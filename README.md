# YOUTH ROBE Manifest & Gatepass

Small private web app. One entry creates a **Dispatch Manifest** (proof of shipments handed to a courier) and a
**Vehicle Gate Pass** (entry/exit of the courier vehicle), both branded YOUTH ROBE with the logistics partner name.
All data lives in one Excel file; every record can be downloaded again as PDF at any time.

## What is stored (data/manifest_db.xlsx)
- **Dispatches** sheet: date/time, employee, logistics partner, courier boy name + phone, vehicle number + type,
  notes, manifest no, gatepass no, gate entry/exit time, created by.
- **Items** sheet: every Order ID / AWB, linked to its dispatch.

## Run locally
```bash
pip install -r requirements.txt
python users.py add aryan "Aryan Agrawal" admin     # asks for a password (min 8 chars)
python users.py add gate "Gate Security" staff
python app.py                                        # http://127.0.0.1:5000
```

## Access control
Only people you add with `users.py` can log in (passwords are stored hashed in `data/users.json`).
`python users.py list` / `python users.py remove <username>` manage them.
Keep this repo **private**: `data/` (database, users, secret key) is git-ignored and must never be committed.

## Run on a server (recommended: your own PC/VPS so the Excel file persists)
```bash
export COOKIE_SECURE=1          # when served over HTTPS
gunicorn -w 1 --threads 4 -b 0.0.0.0:8000 app:app
```
Use **one worker** (`-w 1`) because the Excel file is the database; writes are locked and atomic inside one process.
Put it behind HTTPS (Caddy / nginx / Cloudflare Tunnel). Hosts with temporary disks (e.g. Vercel) will lose the Excel file.

## Branding
Drop a logo at `static/logo.png` and it replaces the "YOUTH ROBE" text in the PDF header.

## Backups
A copy of the database is saved to `data/backups/` once per day. Back up the `data/` folder regularly.

## Limits of Excel as a database
Fine for a few users and tens of thousands of rows. Do not open and save the Excel file while the app is running
(download it from the app's "Download full Excel" button instead).
