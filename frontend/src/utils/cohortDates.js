/**
 * Date & week-duration helpers for Cohort creation and timeline updates.
 * All date strings use strict local YYYY-MM-DD format to avoid UTC timezone shifts.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateString() {
  return formatLocalIsoDate(new Date());
}

export function parseUtcTimestamp(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const match = ISO_DATE_RE.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ts = Date.UTC(year, month - 1, day);
  const check = new Date(ts);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ts;
}

export function addDaysToIsoDate(dateStr, days) {
  const ts = parseUtcTimestamp(dateStr);
  if (ts === null) return '';
  const next = new Date(ts + days * MS_PER_DAY);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculate cohort duration in whole weeks, rounding partial weeks up.
 * Returns null if dates are missing, malformed, or endDate <= startDate.
 */
export function calculateCohortDurationWeeks(startStr, endStr) {
  const startTs = parseUtcTimestamp(startStr);
  const endTs = parseUtcTimestamp(endStr);
  if (startTs === null || endTs === null || endTs <= startTs) {
    return null;
  }
  const diffDays = Math.round((endTs - startTs) / MS_PER_DAY);
  return Math.max(1, Math.ceil(diffDays / 7));
}

export function formatDurationLabel(weeks, placeholder = 'Select valid start and end dates') {
  if (weeks === null || weeks === undefined || weeks < 1) {
    return placeholder;
  }
  return weeks === 1 ? '1 Week' : `${weeks} Weeks`;
}

export function validateCohortDates(startStr, endStr, { requireFutureStart = true } = {}) {
  const todayStr = getTodayDateString();
  const startTs = parseUtcTimestamp(startStr);
  const endTs = parseUtcTimestamp(endStr);

  let startDateError = '';
  let endDateError = '';

  if (!startStr) {
    startDateError = 'Start date is required.';
  } else if (startTs === null) {
    startDateError = 'Enter a valid start date.';
  } else if (requireFutureStart && startStr < todayStr) {
    startDateError = 'Start date cannot be in the past.';
  }

  if (!endStr) {
    endDateError = 'End date is required.';
  } else if (endTs === null) {
    endDateError = 'Enter a valid end date.';
  } else if (startTs !== null && endTs <= startTs) {
    endDateError = 'End date must be later than the start date.';
  }

  const durationWeeks =
    !startDateError && !endDateError
      ? calculateCohortDurationWeeks(startStr, endStr)
      : null;

  return {
    startDateError,
    endDateError,
    isValid: !startDateError && !endDateError,
    durationWeeks,
  };
}
