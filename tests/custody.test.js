import { describe, it, expect } from 'vitest';
import {
  baseCustody, custodyFor, daySummary, isTransfer, nextTransfer,
  balance, activityOn, money, addDays, PRESETS,
} from '@/lib/custody';

const weeks = { type: 'weeks', anchor_date: '2026-07-27' }; // a Monday
const kids = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('custody engine', () => {
  it('alternating weeks: 7 on, 7 off, wraps and extends backwards', () => {
    expect(baseCustody(weeks, '2026-07-27')).toBe('h'); // day 1
    expect(baseCustody(weeks, '2026-08-02')).toBe('h'); // day 7
    expect(baseCustody(weeks, '2026-08-03')).toBe('c'); // day 8
    expect(baseCustody(weeks, '2026-08-09')).toBe('c'); // day 14
    expect(baseCustody(weeks, '2026-08-10')).toBe('h'); // wraps
    expect(baseCustody(weeks, '2026-07-26')).toBe('c'); // before anchor
    expect(baseCustody(weeks, '2026-07-13')).toBe('h'); // two weeks before
  });

  it('2-2-3 preset follows the documented rotation', () => {
    const sch = { type: '223', anchor_date: '2026-07-27' };
    const expected = ['h','h','c','c','h','h','h','c','c','h','h','c','c','c'];
    expected.forEach((w, i) => {
      expect(baseCustody(sch, addDays('2026-07-27', i))).toBe(w);
    });
  });

  it('presets all have 14-day cycles', () => {
    for (const arr of Object.values(PRESETS)) expect(arr).toHaveLength(14);
  });

  it('returns null without an anchor date', () => {
    expect(baseCustody({ type: 'weeks', anchor_date: null }, '2026-08-01')).toBe(null);
  });

  it('accepted deviations override; proposed ones do not', () => {
    const devs = [
      { status: 'accepted', start_date: '2026-08-04', end_date: '2026-08-05', who: 'h', child_ids: ['a'] },
      { status: 'proposed', start_date: '2026-08-06', end_date: '2026-08-06', who: 'h', child_ids: [] },
    ];
    expect(custodyFor(weeks, devs, '2026-08-04', 'a')).toBe('h');   // overridden
    expect(custodyFor(weeks, devs, '2026-08-04', 'b')).toBe('c');   // not in scope
    expect(custodyFor(weeks, devs, '2026-08-06', 'a')).toBe('c');   // proposed ignored
  });

  it('empty child list on a deviation means all children', () => {
    const devs = [{ status: 'accepted', start_date: '2026-08-14', end_date: '2026-08-16', who: 'h', child_ids: [] }];
    expect(custodyFor(weeks, devs, '2026-08-15', 'd')).toBe('h');
  });

  it('daySummary reports mix when kids are split', () => {
    const devs = [{ status: 'accepted', start_date: '2026-08-04', end_date: '2026-08-04', who: 'h', child_ids: ['a'] }];
    expect(daySummary(weeks, devs, kids, '2026-08-04')).toBe('mix');
    expect(daySummary(weeks, [], kids, '2026-08-04')).toBe('c');
  });

  it('detects transfers, including ones created by deviations', () => {
    expect(isTransfer(weeks, [], kids, '2026-08-03')).toBe(true);
    expect(isTransfer(weeks, [], kids, '2026-08-04')).toBe(false);
    const devs = [{ status: 'accepted', start_date: '2026-08-04', end_date: '2026-08-05', who: 'h', child_ids: ['a'] }];
    expect(isTransfer(weeks, devs, kids, '2026-08-04')).toBe(true);
    expect(nextTransfer(weeks, [], kids, '2026-07-27')).toBe('2026-08-03');
  });
});

describe('balance', () => {
  const arr75 = { split_pct: 75 };
  it('computes the 75/25 split and excludes pending expenses', () => {
    const exp = [
      { status: 'approved', amount: 100, paid_by: 'c' },  // I owe 75
      { status: 'approved', amount: 200, paid_by: 'h' },  // they owe 50
      { status: 'pending', amount: 900, paid_by: 'c' },   // ignored
      { status: 'disputed', amount: 400, paid_by: 'c' },  // ignored
    ];
    expect(balance(arr75, exp, [])).toBeCloseTo(25);
  });
  it('settlements zero the balance in both directions', () => {
    const exp = [{ status: 'approved', amount: 100, paid_by: 'c' }];
    expect(balance(arr75, exp, [{ direction: 'h2c', amount: 75 }])).toBeCloseTo(0);
    expect(balance(arr75, exp, [{ direction: 'c2h', amount: 25 }])).toBeCloseTo(100);
  });
  it('handles a 50/50 arrangement', () => {
    expect(balance({ split_pct: 50 }, [{ status: 'approved', amount: 100, paid_by: 'c' }], [])).toBeCloseTo(50);
  });
  it('a per-expense split override beats the arrangement default', () => {
    const exp = [
      // h paid, charging back 100% (h share 0): they owe the full amount
      { status: 'approved', amount: 100, paid_by: 'h', split_pct: 0 },
      // c paid, no reimbursement (h share 0): nothing owed
      { status: 'approved', amount: 500, paid_by: 'c', split_pct: 0 },
      // null override falls back to the 75/25 default
      { status: 'approved', amount: 100, paid_by: 'c', split_pct: null },
    ];
    expect(balance(arr75, exp, [])).toBeCloseTo(-100 + 0 + 75);
  });
});

describe('activities', () => {
  const season = { start_date: '2026-08-15', end_date: '2026-10-30', days: [2, 4] }; // Tue/Thu
  it('recurring activities match weekdays within the season', () => {
    expect(activityOn(season, '2026-08-18')).toBe(true);   // Tue
    expect(activityOn(season, '2026-08-20')).toBe(true);   // Thu
    expect(activityOn(season, '2026-08-19')).toBe(false);  // Wed
    expect(activityOn(season, '2026-08-11')).toBe(false);  // before
    expect(activityOn(season, '2026-11-03')).toBe(false);  // after
  });
  it('one-day activities occur exactly once', () => {
    const game = { start_date: '2026-09-12', end_date: '2026-09-12', days: [] };
    expect(activityOn(game, '2026-09-12')).toBe(true);
    expect(activityOn(game, '2026-09-13')).toBe(false);
  });
});

describe('formatting', () => {
  it('money renders sign and cents', () => {
    expect(money(1234.5)).toBe('$1234.50');
    expect(money(-3)).toBe('-$3.00');
    expect(money(0)).toBe('$0.00');
  });
});
