# Renewal Reminder Bot (Google Apps Script)

A sanitized, production-grade Google Apps Script that scans a Google Sheet for clients due for renewal in ~30 days, pings the assigned coach on Slack, and marks the row as “sent” to prevent duplicate reminders. Secrets (Slack webhook, mappings) live in **Script Properties**, not in source control.

**Why this exists:** reduce manual follow‑ups, close renewal gaps, and keep coaches accountable with zero spreadsheet babysitting.

## Features
- Finds clients whose “Resign Due Date” is within a configurable day window (default 29–31 days).
- Mentions the correct coach in Slack and logs any unmapped names.
- Marks a “Reminder Sent” column to avoid double‑reminders.
- Reads coach → SlackID mapping from a `Coaches` sheet or a JSON property.
- Sanitized: no webhook URLs or IDs in code.

## Sheet Requirements (MasterData)
Headers must exist (exact text):
- `Client Name`
- `Coach`
- `Resign Due Date`
- `Reminder Sent` (checkbox or text; script sets TRUE)

Optional: Create a **Coaches** sheet with:
- Column A: `Name`
- Column B: `SlackID`

## Script Properties (File → Project properties → Script properties)
Required:
- `SLACK_RENEWAL_WEBHOOK_URL`

Optional:
- `COACH_MAP_JSON` — e.g. `{ "sarah zalud": "UXXXX", "alexis schminke": "UYYYY" }`
- `RENEWAL_WINDOW_MIN_DAYS` (default 29)
- `RENEWAL_WINDOW_MAX_DAYS` (default 31)
- `SHEET_NAME_MASTER` (default `MasterData`)
- `SHEET_NAME_COACHES` (default `Coaches`)

## How to Use
1. Open your Sheet → **Extensions → Apps Script**.
2. Add `src/renewal_reminder.gs` (from this repo) to your project.
3. Set Script Properties (see above).
4. Ensure headers exist in `MasterData`. Optionally add a `Coaches` tab.
5. Run `sendRenewalReminders()` (you can bind to a time-based trigger for daily runs).

## Local Dev (optional, clasp)
- Install clasp: `npm i -g @google/clasp`
- `clasp login`
- Create a project with `--rootDir ./src`, or add files manually in the editor.
- Don’t commit `.clasp.json` if public.

## Security Notes
- Never hardcode webhooks, API keys, or IDs—keep them in Script Properties.
- This repo includes **no** real identifiers; safe for public GitHub.

## What it does (plain English)
Checks who is due for renewal next month, pings the right coach on Slack, and checks a box so you won’t nag twice. Logs any coach names it couldn’t map so you can fix the data instead of chasing ghosts.

## License
MIT
