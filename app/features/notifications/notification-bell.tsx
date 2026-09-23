'use client';

import { useEffect, useState } from 'react';
import * as I from 'lucide-react';

type Notification = {
  id: string;
  category: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const load = () =>
    void fetch('/api/notifications', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          result: {
            notifications?: Notification[];
            unreadCount?: number;
          } | null,
        ) => {
          if (!result) return;
          setNotifications(result.notifications ?? []);
          setUnreadCount(result.unreadCount ?? 0);
        },
      )
      .catch(() => undefined);

  useEffect(load, []);
  useEffect(() => {
    const interval = window.setInterval(load, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' }).catch(
      () => undefined,
    );
    load();
  }

  async function markAllRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' }).catch(
      () => undefined,
    );
    load();
  }

  return (
    <div className="notification-bell">
      <button
        className="notification-trigger"
        aria-label="Notifications"
        onClick={() => setOpen((value) => !value)}
      >
        <I.Bell />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="notification-panel">
          <header>
            <b>Notifications</b>
            {unreadCount > 0 && (
              <button onClick={() => void markAllRead()}>
                Tout marquer lu
              </button>
            )}
          </header>
          {notifications.length === 0 && (
            <p className="empty">Aucune notification pour le moment.</p>
          )}
          {notifications.map((item) => (
            <button
              key={item.id}
              className={
                item.readAt ? 'notification-item' : 'notification-item unread'
              }
              onClick={() => !item.readAt && void markRead(item.id)}
            >
              <b>{item.title}</b>
              {item.body && <small>{item.body}</small>}
              <time>{new Date(item.createdAt).toLocaleString('fr-FR')}</time>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
