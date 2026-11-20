// Shared by the bell (Shell), the push sender (/api/push), and tests.

// Where a notification points, by its type prefix (parent routes are enough).
const NOTIF_ROUTES = [
  ['expense', '/expenses'],
  ['support', '/expenses'],
  ['deviation', '/calendar'],
  ['day_comment', '/calendar'],
  ['todo', '/todos'],
  ['post', '/messages'],
  ['file', '/files'],
];
export const notifHref = type =>
  NOTIF_ROUTES.find(([prefix]) => (type || '').startsWith(prefix))?.[1] || '/dashboard';

// Which notification types also go out as a push, and their headline.
// Everything else stays in the bell and the daily digest.
const PUSH_TITLES = {
  post: 'New conversation',
  post_comment: 'New reply',
  deviation_proposed: 'Schedule change proposed',
  deviation_accepted: 'Schedule change accepted',
  deviation_declined: 'Schedule change declined',
};

// The push payload for a notifications row, or null when it shouldn't push
// (pre-read rows are the actor's own copy).
export function pushPayload(n) {
  if (!n || n.read || !PUSH_TITLES[n.type]) return null;
  return {
    title: PUSH_TITLES[n.type],
    body: n.message,
    url: notifHref(n.type),
    // Same source row (e.g. one conversation) replaces rather than stacks
    tag: n.ref_id || String(n.id),
  };
}
