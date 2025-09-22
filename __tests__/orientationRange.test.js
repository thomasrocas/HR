const { deriveAllProgramsRange } = require('../public/orientation_range_utils.js');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  return new Date(date.getTime() + (days * MS_PER_DAY));
}

describe('orientation range utilities', () => {
  test('all-program view covers earliest start through latest program week span', () => {
    const rows = [
      { program_id: 'alpha', scheduled_for: '2024-01-08', week_number: 1 },
      { program_id: 'alpha', scheduled_for: '2024-02-05', week_number: 5 },
      { program_id: 'beta', scheduled_for: '2024-03-04', week_number: 1 },
    ];
    const programInfoMap = new Map([
      ['alpha', { totalWeeks: 6 }],
      ['beta', { totalWeeks: 10 }],
    ]);

    const result = deriveAllProgramsRange(rows, {
      programInfoMap,
      fallbackStartDate: '2024-01-01',
      fallbackWeeks: 6,
    });

    expect(result.startDate).toBe('2024-01-08');

    const earliestStart = parseDate(result.startDate);
    const calendarEnd = addDays(earliestStart, (result.numWeeks * 7) - 1);
    const betaEnd = addDays(parseDate('2024-03-04'), (10 * 7) - 1);
    expect(calendarEnd.getTime()).toBeGreaterThanOrEqual(betaEnd.getTime());

    const coverageDays = Math.floor((betaEnd.getTime() - earliestStart.getTime()) / MS_PER_DAY) + 1;
    const expectedWeeks = Math.ceil(coverageDays / 7);
    expect(result.numWeeks).toBe(expectedWeeks);
  });
});
