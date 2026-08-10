import { describe, it, expect } from 'vitest';
import {
  sideName, kidSideName, mySide, isViewer, bothSidesJoined, arrName,
  childIdentity, kidName,
} from '@/lib/store';

// Homes model: members are synthesized from the two side households by the
// store; identities are self-declared per arrangement.
const arr = {
  h_label: 'Us', c_label: 'Them', kid_h_label: 'Papa', kid_c_label: 'Mama',
  name: 'SJ',
  members: [
    { user_id: 'erin', side: 'h', profiles: { name: 'Erin' } },   // partner, listed first on purpose
    { user_id: 'nate', side: 'h', profiles: { name: 'Nate' } },
    { user_id: 'chris', side: 'c', profiles: { name: 'Christin' } },
  ],
  member_identities: [
    { user_id: 'nate', identity: 'dad', label: null },
    { user_id: 'erin', identity: 'stepmom', label: null },
    { user_id: 'chris', identity: 'mom', label: null },
  ],
  arrangement_prefs: [],
  arrangement_viewers: [{ user_id: 'gran', profiles: { name: 'Gran' } }],
  children: [{ id: 'k1', name: 'Molly Arnold', user_id: 'kid-molly' }, { id: 'k2', name: 'Jude', user_id: null }],
};

describe('side names', () => {
  it('shows the parent (mom/dad identity), not the partner, even when listed later', () => {
    expect(sideName(arr, 'h')).toBe('Nate');
    expect(sideName(arr, 'c')).toBe('Christin');
  });
  it('uses placeholders only while a side is empty', () => {
    const empty = { ...arr, members: arr.members.filter(m => m.side === 'h') };
    expect(sideName(empty, 'c')).toBe('Them');
    const bare = { members: [], children: [] };
    expect(sideName(bare, 'h')).toBe('Us');
    expect(sideName(bare, 'c')).toBe('Them');
  });
  it('children see declared identities, then kid placeholders', () => {
    expect(kidSideName(arr, 'h')).toBe('Dad');
    expect(kidSideName(arr, 'c')).toBe('Mom');
    const noIdent = { ...arr, member_identities: [] };
    expect(kidSideName(noIdent, 'h')).toBe('Papa');
    const noNothing = { ...noIdent, kid_h_label: null };
    expect(kidSideName(noNothing, 'h')).toBe('Erin'); // falls through to sideName (first member)
  });
  it('custom identity labels win', () => {
    const withLabel = {
      ...arr,
      member_identities: [{ user_id: 'nate', identity: 'other', label: 'Papa Bear' }],
    };
    expect(kidSideName(withLabel, 'h')).toBe('Papa Bear');
  });
});

describe('roles', () => {
  it('identifies sides, partners, and viewers', () => {
    expect(mySide(arr, 'nate')).toBe('h');
    expect(mySide(arr, 'erin')).toBe('h');   // partner has full side membership
    expect(mySide(arr, 'chris')).toBe('c');
    expect(mySide(arr, 'gran')).toBe(null);
    expect(isViewer(arr, 'gran')).toBe(true);
    expect(isViewer(arr, 'nate')).toBe(false);
  });
  it('knows when both homes have joined', () => {
    expect(bothSidesJoined(arr)).toBe(true);
    expect(bothSidesJoined({ ...arr, members: arr.members.filter(m => m.side === 'h') })).toBe(false);
  });
  it('finds child identity from linked accounts', () => {
    const found = childIdentity([arr], 'kid-molly');
    expect(found?.kid.name).toBe('Molly Arnold');
    expect(childIdentity([arr], 'nate')).toBe(null);
  });
  it('resolves kid names', () => {
    expect(kidName(arr, 'k2')).toBe('Jude');
    expect(kidName(arr, 'nope')).toBe('?');
  });
});

describe('arrangement display name', () => {
  it('defaults to the kids’ first names', () => {
    expect(arrName(arr)).toBe('Molly & Jude');
  });
  it('a personal nickname wins', () => {
    expect(arrName({ ...arr, arrangement_prefs: [{ user_id: 'nate', nickname: 'The crew' }] })).toBe('The crew');
  });
  it('falls back to the stored name with no children', () => {
    expect(arrName({ ...arr, children: [] })).toBe('SJ');
  });
});
