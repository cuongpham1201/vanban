'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import NotificationDropdown from './NotificationDropdown';
import { DmsNotification } from '@/lib/dms/notifications/types';
import { safeJsonFetch } from '@/lib/client/safeJsonFetch';
import styles from './notifications.module.css';

const POLL_MS = 30_000;

// Chuông thông báo (header). Badge số chưa đọc + dropdown. Phase 1: web only.
export default function NotificationBell(): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const [items, setItems] = React.useState<DmsNotification[]>([]);
  const [loading, setLoading] = React.useState(false);

  const refreshCount = React.useCallback(async () => {
    // safeJsonFetch: KHÔNG ném "Unexpected token '<'" nếu proxy trả HTML — chuông im lặng, không phá header.
    const { data } = await safeJsonFetch<{ ok: boolean; count?: number }>('/api/notifications/unread-count', { cache: 'no-store' });
    if (data?.ok && typeof data.count === 'number') setCount(data.count);
  }, []);

  const loadList = React.useCallback(async () => {
    setLoading(true);
    const { data } = await safeJsonFetch<{ ok: boolean; notifications?: DmsNotification[] }>('/api/notifications?top=20', { cache: 'no-store' });
    if (data?.ok && Array.isArray(data.notifications)) setItems(data.notifications);
    setLoading(false);
  }, []);

  // Poll unread count.
  React.useEffect(() => {
    void refreshCount();
    const t = window.setInterval(() => void refreshCount(), POLL_MS);
    return () => window.clearInterval(t);
  }, [refreshCount]);

  const toggle = (): void => {
    setOpen((v) => {
      const next = !v;
      if (next) void loadList();
      return next;
    });
  };

  const onItemClick = async (n: DmsNotification): Promise<void> => {
    if (!n.isRead) {
      // optimistic
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setCount((c) => Math.max(0, c - 1));
      try {
        await fetch('/api/notifications/mark-read', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: n.id }),
        });
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    if (n.url) {
      router.push(n.url);
    }
  };

  const onMarkAll = async (): Promise<void> => {
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setCount(0);
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST', credentials: 'same-origin' });
    } catch {
      /* ignore */
    }
  };

  const hasUnread = items.some((x) => !x.isRead) || count > 0;

  return (
    <div className={styles.wrap}>
      <div
        className="iconbtn"
        title="Thông báo"
        role="button"
        tabIndex={0}
        aria-label={`Thông báo${count > 0 ? ` (${count} chưa đọc)` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <Icon name="bell" />
        {count > 0 && <span className={styles.badge}>{count > 99 ? '99+' : count}</span>}
      </div>

      {open && (
        <NotificationDropdown
          items={items}
          loading={loading}
          hasUnread={hasUnread}
          onItemClick={(n) => void onItemClick(n)}
          onMarkAll={() => void onMarkAll()}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
