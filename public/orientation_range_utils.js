(function (global) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

  function toPositiveInteger(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      const normalized = Math.trunc(value);
      return normalized > 0 ? normalized : null;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        return parsed > 0 ? parsed : null;
      }
    }
    return null;
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }
    if (typeof value !== 'string') return null;
    const match = value.match(DATE_REGEX);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return null;
    }
    return date;
  }

  function formatDate(date) {
    const safeDate = parseDate(date);
    if (!safeDate) return null;
    const year = safeDate.getUTCFullYear();
    const month = String(safeDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(safeDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    const safeDate = parseDate(date);
    if (!safeDate) return null;
    const result = new Date(safeDate.getTime() + (amount * MS_PER_DAY));
    return new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth(), result.getUTCDate()));
  }

  function normalizeWeekNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value === null || typeof value === 'undefined') return null;
    const match = String(value).match(/(-?\d+)/);
    if (!match) return null;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function getProgramInfo(map, programId) {
    if (!programId) return null;
    if (map && typeof map.get === 'function') {
      return map.get(programId) || null;
    }
    if (map && Object.prototype.hasOwnProperty.call(map, programId)) {
      return map[programId];
    }
    return null;
  }

  function deriveProgramRange(rows = [], options = {}) {
    const fallbackStartDateRaw = options.fallbackStartDate || formatDate(new Date());
    const fallbackStartDate = formatDate(fallbackStartDateRaw) || formatDate(new Date());
    const fallbackWeeks = toPositiveInteger(options.fallbackWeeks) || 6;
    const programInfo = options.programInfo || null;

    let earliestDate = null;
    let highestWeek = 0;

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row) return;
      const scheduledFor = row.scheduled_for || row.scheduledFor || null;
      const parsedDate = parseDate(scheduledFor);
      if (parsedDate) {
        if (!earliestDate || parsedDate.getTime() < earliestDate.getTime()) {
          earliestDate = parsedDate;
        }
      }
      const weekValue = normalizeWeekNumber(row.week_number || row.weekNumber);
      if (typeof weekValue === 'number' && weekValue > highestWeek) {
        highestWeek = weekValue;
      }
    });

    const programDuration = toPositiveInteger(
      programInfo ? (programInfo.totalWeeks ?? programInfo.total_weeks ?? programInfo.duration ?? null) : null,
    );
    if (programDuration && programDuration > highestWeek) {
      highestWeek = programDuration;
    }

    const startDate = formatDate(earliestDate) || fallbackStartDate;
    const numWeeks = highestWeek > 0 ? highestWeek : fallbackWeeks;

    return { startDate, numWeeks };
  }

  function deriveAllProgramsRange(rows = [], options = {}) {
    const fallbackStartDateRaw = options.fallbackStartDate || formatDate(new Date());
    const fallbackStartDate = formatDate(fallbackStartDateRaw) || formatDate(new Date());
    const fallbackWeeks = toPositiveInteger(options.fallbackWeeks) || 6;
    const programInfoMap = options.programInfoMap || new Map();

    const normalizedRows = Array.isArray(rows) ? rows : [];
    let globalEarliest = null;
    let globalLatest = null;
    const perProgram = new Map();

    normalizedRows.forEach((row) => {
      if (!row) return;
      const programIdRaw = row.program_id || row.programId || row.program || '';
      const programId = programIdRaw ? String(programIdRaw) : '';
      const scheduledFor = row.scheduled_for || row.scheduledFor || null;
      const parsedDate = parseDate(scheduledFor);
      if (parsedDate) {
        if (!globalEarliest || parsedDate.getTime() < globalEarliest.getTime()) {
          globalEarliest = parsedDate;
        }
        if (!globalLatest || parsedDate.getTime() > globalLatest.getTime()) {
          globalLatest = parsedDate;
        }
      }
      const weekValue = normalizeWeekNumber(row.week_number || row.weekNumber);
      const programInfo = getProgramInfo(programInfoMap, programId);
      const duration = toPositiveInteger(
        programInfo ? (programInfo.totalWeeks ?? programInfo.total_weeks ?? programInfo.duration ?? null) : null,
      );

      const existing = perProgram.get(programId) || {
        earliest: null,
        latest: null,
        maxWeek: 0,
        duration: 0,
      };
      if (parsedDate) {
        if (!existing.earliest || parsedDate.getTime() < existing.earliest.getTime()) {
          existing.earliest = parsedDate;
        }
        if (!existing.latest || parsedDate.getTime() > existing.latest.getTime()) {
          existing.latest = parsedDate;
        }
      }
      if (typeof weekValue === 'number' && weekValue > existing.maxWeek) {
        existing.maxWeek = weekValue;
      }
      if (duration && duration > existing.duration) {
        existing.duration = duration;
      }
      perProgram.set(programId, existing);
    });

    perProgram.forEach((entry) => {
      const start = entry.earliest || globalEarliest;
      if (!start) return;
      const weeks = Math.max(
        entry.maxWeek > 0 ? entry.maxWeek : 0,
        entry.duration > 0 ? entry.duration : 0
      );
      if (weeks > 0) {
        const programEnd = addDays(start, (weeks * 7) - 1);
        if (programEnd && (!globalLatest || programEnd.getTime() > globalLatest.getTime())) {
          globalLatest = programEnd;
        }
      } else if (entry.latest && (!globalLatest || entry.latest.getTime() > globalLatest.getTime())) {
        globalLatest = entry.latest;
      }
    });

    if (!globalEarliest) {
      return { startDate: fallbackStartDate, numWeeks: fallbackWeeks };
    }

    if (!globalLatest) {
      globalLatest = addDays(globalEarliest, (fallbackWeeks * 7) - 1);
    }

    const totalDays = Math.max(0, Math.round((globalLatest.getTime() - globalEarliest.getTime()) / MS_PER_DAY));
    const numWeeks = Math.max(1, Math.ceil((totalDays + 1) / 7));

    return { startDate: formatDate(globalEarliest), numWeeks };
  }

  const exportsObj = {
    deriveProgramRange,
    deriveAllProgramsRange,
    normalizeWeekNumber,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  if (global) {
    const target = global.orientationRangeUtils || {};
    global.orientationRangeUtils = Object.assign({}, target, exportsObj);
  }
})(typeof window !== 'undefined' ? window : globalThis);
