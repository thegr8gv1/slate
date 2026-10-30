import type { AppNotification, NotificationKind } from '../contracts/index.js';
import { all, run } from '../db/index.js';
import { newId } from '../lib/ids.js';

/**
 * Notification fan-out.
 *
 * Writes durable rows and pushes to any live SSE subscriber for that account.
 * In production this hands off to APNs/FCM through the push gateway; the
 * in-process bus below keeps the same "write then publish" ordering so a
 * dropped connection can always be reconciled from the table.
 */

type Listener = (notification: AppNotification) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(accountId: string, listener: Listener): () => void {
  const set = listeners.get(accountId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(accountId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(accountId);
  };
}

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body: string;
  deepLink?: string | null;
  priority?: AppNotification['priority'];
}

export function notify(accountId: string, input: NotifyInput): AppNotification {
  const notification: AppNotification = {
    id: newId('ntf'),
    accountId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    deepLink: input.deepLink ?? null,
    readAt: null,
    createdAt: new Date().toISOString(),
    priority: input.priority ?? 'normal',
  };

  run(
    `INSERT INTO notifications (id, account_id, kind, priority, read_at, data, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    notification.id,
    accountId,
    notification.kind,
    notification.priority,
    JSON.stringify(notification),
    notification.createdAt,
  );

  for (const listener of listeners.get(accountId) ?? []) {
    try {
      listener(notification);
    } catch {
      // A failed live delivery must never roll back the durable write.
    }
  }
  return notification;
}

/** High-fanout path used by Set-Beacon; one write per targeted device owner. */
export function notifyMany(accountIds: string[], input: NotifyInput): number {
  let delivered = 0;
  for (const accountId of accountIds) {
    notify(accountId, input);
    delivered += 1;
  }
  return delivered;
}

export function markRead(accountId: string, notificationId: string): void {
  const readAt = new Date().toISOString();
  const rows = all<{ data: string }>(
    'SELECT data FROM notifications WHERE id = ? AND account_id = ?',
    notificationId,
    accountId,
  );
  if (rows.length === 0) return;
  const parsed = JSON.parse(rows[0].data) as AppNotification;
  run(
    'UPDATE notifications SET read_at = ?, data = ? WHERE id = ?',
    readAt,
    JSON.stringify({ ...parsed, readAt }),
    notificationId,
  );
}

export function liveSubscriberCount(): number {
  let total = 0;
  for (const set of listeners.values()) total += set.size;
  return total;
}
