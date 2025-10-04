/**************************************************************
 * Renewal Reminder Bot (Sanitized) - Google Apps Script
 * Scans "MasterData" for clients ~30 days from renewal,
 * mentions their coach on Slack, and marks "Reminder Sent".
 *
 * Required Script Property:
 *   SLACK_RENEWAL_WEBHOOK_URL
 *
 * Optional Script Properties:
 *   COACH_MAP_JSON, RENEWAL_WINDOW_MIN_DAYS, RENEWAL_WINDOW_MAX_DAYS,
 *   SHEET_NAME_MASTER, SHEET_NAME_COACHES
 **************************************************************/

function sendRenewalReminders() {
  const props = PropertiesService.getScriptProperties();
  const webhookUrl = getPropOrThrow_('SLACK_RENEWAL_WEBHOOK_URL');

  const SHEET_NAME_MASTER = props.getProperty('SHEET_NAME_MASTER') || 'MasterData';
  const SHEET_NAME_COACHES = props.getProperty('SHEET_NAME_COACHES') || 'Coaches';
  const MIN_DAYS = Number(props.getProperty('RENEWAL_WINDOW_MIN_DAYS') || 29);
  const MAX_DAYS = Number(props.getProperty('RENEWAL_WINDOW_MAX_DAYS') || 31);

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEET_NAME_MASTER);
  if (!sheet) throw new Error('Missing sheet: ' + SHEET_NAME_MASTER);

  const rangeAll = sheet.getDataRange().getDisplayValues();
  if (rangeAll.length < 2) return; // no data
  const headers = rangeAll[0].map(h => String(h || '').trim());
  const col = makeHeaderIndex_(headers);

  ['Client Name', 'Coach', 'Resign Due Date', 'Reminder Sent'].forEach(h => {
    if (!(h in col)) throw new Error('Missing required header: ' + h);
  });

  const lastRow = findLastRealRow_(sheet, 'Client Name');
  if (lastRow < 2) return;

  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues();

  const coachMap = buildCoachMap_(ss.getSheetByName(SHEET_NAME_COACHES), props.getProperty('COACH_MAP_JSON'));

  const todayMid = toMidnight_(new Date());
  const unknownCoaches = new Set();
  let sentCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;

    const clientName = String(r[col['Client Name']] || '').trim();
    const coachName  = String(r[col['Coach']] || '').trim();
    const dueRaw     = r[col['Resign Due Date']];
    const sentVal    = r[col['Reminder Sent']];

    if (!clientName || !coachName) continue;
    if (isAlreadySent_(sentVal)) continue;

    const dueDate = coerceDate_(dueRaw);
    if (!dueDate) continue;

    const daysAway = diffDays_(toMidnight_(dueDate), todayMid);
    if (daysAway < MIN_DAYS || daysAway > MAX_DAYS) continue;

    const slackId = coachMap[normalize_(coachName)];
    if (!slackId) { unknownCoaches.add(coachName); continue; }

    const mention = '<@' + slackId + '>';
    const text = ':spiral_calendar_pad: ' + mention + ' ' + clientName + ' is due for renewal *within the next month*. Please schedule their call.';

    const payload = { text: text };
    const ok = postToSlackWithRetry_(webhookUrl, payload, 3);
    if (!ok) {
      Logger.log('WARN: Slack post failed for row ' + rowNum + ' (' + clientName + ')');
      continue;
    }

    sheet.getRange(rowNum, col['Reminder Sent'] + 1).setValue(true);
    sentCount++;
    Utilities.sleep(120);
  }

  if (unknownCoaches.size) {
    Logger.log('Unmapped coach names: ' + Array.from(unknownCoaches).sort().join(', '));
  }
  Logger.log('Renewal reminders sent: ' + sentCount);
}

/* ======================= helpers ======================= */

function getPropOrThrow_(key) {
  const v = (PropertiesService.getScriptProperties().getProperty(key) || '').trim();
  if (!v) throw new Error('Missing script property: ' + key);
  return v;
}

function makeHeaderIndex_(headers) {
  const map = {};
  headers.forEach(function(h, i){ if (h) map[h] = i; });
  return map;
}

function findLastRealRow_(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const colIndex = headers.findIndex(function(h){ return String(h).trim() === headerName; });
  if (colIndex < 0) throw new Error('Header not found for last-row scan: ' + headerName);
  const colValues = sheet.getRange(2, colIndex + 1, Math.max(sheet.getLastRow() - 1, 0), 1).getDisplayValues().flat();
  for (let i = colValues.length - 1; i >= 0; i--) {
    if (String(colValues[i] || '').trim() !== '') return i + 2;
  }
  return 1;
}

function isAlreadySent_(v) {
  if (v === true) return true;
  if (v instanceof Date && !isNaN(v)) return true;
  const s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'sent' || s === 'y';
}

function coerceDate_(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function toMidnight_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffDays_(aMid, bMid) {
  var MS_DAY = 24 * 60 * 60 * 1000;
  return Math.round((aMid.getTime() - bMid.getTime()) / MS_DAY);
}

function normalize_(s) {
  return String(s || '').replace(/\\u00A0/g, ' ').replace(/\\s+/g, ' ').trim().toLowerCase();
}

function buildCoachMap_(coachesSheet, jsonStr) {
  const map = {};
  if (coachesSheet) {
    const vals = coachesSheet.getDataRange().getDisplayValues();
    for (let i = 1; i < vals.length; i++) {
      const name = normalize_(vals[i][0]);
      const id   = String(vals[i][1] || '').trim();
      if (name && id) map[name] = id;
    }
  }
  if (jsonStr) {
    try {
      const obj = JSON.parse(jsonStr);
      Object.keys(obj || {}).forEach(function(k){
        const key = normalize_(k);
        if (key && obj[k]) map[key] = String(obj[k]).trim();
      });
    } catch (e) {
      Logger.log('WARN: Invalid COACH_MAP_JSON: ' + e);
    }
  }
  return map;
}

function postToSlackWithRetry_(url, payload, maxAttempts) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const resp = UrlFetchApp.fetch(url, options);
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) return true;
      Logger.log('Slack HTTP ' + code + ' (attempt ' + attempt + ')');
    } catch (e) {
      Logger.log('Slack error (attempt ' + attempt + '): ' + e);
    }
    Utilities.sleep(250 * attempt);
  }
  return false;
}
