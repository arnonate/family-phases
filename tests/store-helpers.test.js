import { describe, it, expect } from 'vitest';
import { sideName, kidSideName, mySide, myRole, childIdentity, kidName } from '@/lib/store';

const arr = {
  h_label: 'Us', c_label: 'Them', kid_h_label: 'Dad', kid_c_label: 'Mom',
  arrangement_members: [
    { user_id: 'nate', role: 'household', profiles: { name: 'Nate' } },
    { user_id: 'chris', role: 'coparent', profiles: { name: 'Christin' } },
  ],
  children: [{ id: 'k1', name: 'Molly', user_id: 'kid-molly' }, { id: 'k2', name: 'Jude', user_id: null }],
};

describe('side names', () => {
  it('explicit labels beat member account names', () => {
    expect(sideName(arr, 'h')).toBe('Us');
    expect(sideName(arr, 'c')).toBe('Them');
  });
  it('falls back to member names, then Us/Them', () => {
    const noLabels = { ...arr, h_label: null, c_label: null };
    expect(sideName(noLabels, 'h')).toBe('Nate');
    expect(sideName(noLabels, 'c')).toBe('Christin');
    const bare = { arrangement_members: [], children: [] };
    expect(sideName(bare, 'h')).toBe('Us');
    expect(sideName(bare, 'c')).toBe('Them');
  });
  it('children see their own labels', () => {
    expect(kidSideName(arr, 'h')).toBe('Dad');
    expect(kidSideName(arr, 'c')).toBe('Mom');
    expect(kidSideName({ ...arr, kid_h_label: null }, 'h')).toBe('Us'); // falls through to sideName
  });
});

describe('roles', () => {
  it('identifies sides and viewers', () => {
    expect(mySide(arr, 'nate')).toBe('h');
    expect(mySide(arr, 'chris')).toBe('c');
    expect(mySide(arr, 'erin')).toBe(null);
    expect(myRole(arr, 'erin')).toBe('viewer');
  });
  it('finds child identity from linked accounts', () => {
    const found = childIdentity([arr], 'kid-molly');
    expect(found?.kid.name).toBe('Molly');
    expect(childIdentity([arr], 'nate')).toBe(null);
  });
  it('resolves kid names', () => {
    expect(kidName(arr, 'k2')).toBe('Jude');
    expect(kidName(arr, 'nope')).toBe('?');
  });
});
