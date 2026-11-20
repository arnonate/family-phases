import { describe, it, expect } from 'vitest';
import { notifHref, pushPayload } from '@/lib/notify';

describe('notification routing', () => {
  it('maps types to their page', () => {
    expect(notifHref('post_comment')).toBe('/messages');
    expect(notifHref('deviation_accepted')).toBe('/calendar');
    expect(notifHref('file')).toBe('/files');
    expect(notifHref('mystery')).toBe('/dashboard');
  });
});

describe('push payloads', () => {
  const base = { id: 7, user_id: 'u', read: false, message: 'Nate replied in "Fall break": sounds good', ref_id: 'ref-1' };

  it('pushes messages and schedule changes', () => {
    expect(pushPayload({ ...base, type: 'post_comment' })).toEqual({
      title: 'New reply', body: base.message, url: '/messages', tag: 'ref-1',
    });
    expect(pushPayload({ ...base, type: 'deviation_proposed' }).url).toBe('/calendar');
    expect(pushPayload({ ...base, type: 'deviation_declined' }).title).toBe('Schedule change declined');
  });

  it("skips the actor's own (pre-read) copy", () => {
    expect(pushPayload({ ...base, type: 'post', read: true })).toBe(null);
  });

  it('leaves other types to the bell and digest', () => {
    expect(pushPayload({ ...base, type: 'expense_pending' })).toBe(null);
    expect(pushPayload({ ...base, type: 'file' })).toBe(null);
  });

  it('falls back to the row id as the tag', () => {
    expect(pushPayload({ ...base, type: 'post', ref_id: null }).tag).toBe('7');
  });
});
