'use client';

import * as React from 'react';
import { useSession, signOut } from 'next-auth/react';
import Icon from './Icon';
import { isTeamsContext } from '@/lib/client/isTeamsContext';
import styles from './userMenu.module.css';

function firstAlnum(s: string): string {
  const m = s.match(/[\p{L}\p{N}]/u);
  return m ? m[0] : '';
}
function initialsOf(name: string, email: string): string {
  const src = (name || email || '').trim();
  if (!src) return '?';
  const parts = src.split(/\s+/).map(firstAlnum).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[parts.length - 2] + parts[parts.length - 1]).toUpperCase();
  }
  const letters = src.replace(/[^\p{L}\p{N}]/gu, '');
  return (letters.slice(0, 2) || '?').toUpperCase();
}

// Avatar M365 + dropdown hồ sơ. Logout chỉ hiện ngoài Teams (web). UI + auth/session only.
export default function UserMenu(): React.ReactElement {
  const { data: session } = useSession();
  const name = session?.user?.name ?? '';
  const email = session?.user?.email ?? '';
  const initials = initialsOf(name, email);

  const [open, setOpen] = React.useState(false);
  const [photoFailed, setPhotoFailed] = React.useState(false);
  const [showLogout, setShowLogout] = React.useState(true); // mặc định hiện (web)
  const [role, setRole] = React.useState<string | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  // Teams context → ẩn logout. session.teams (server) + heuristic client.
  React.useEffect(() => {
    const teams = isTeamsContext() || session?.teams === true;
    setShowLogout(!teams);
  }, [session?.teams]);

  // Vai trò hiển thị (best-effort) — canWrite → "Quản trị viên".
  React.useEffect(() => {
    let alive = true;
    fetch('/api/dms/write-status', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => alive && setRole(j?.canWrite ? 'Quản trị viên' : 'Người dùng'))
      .catch(() => alive && setRole('Người dùng'));
    return () => {
      alive = false;
    };
  }, []);

  // Esc đóng.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const avatarInner = !photoFailed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.avatarImg} src="/api/me/photo" alt="" onError={() => setPhotoFailed(true)} />
  ) : (
    <span>{initials}</span>
  );

  const onLogout = (): void => {
    setOpen(false);
    void signOut({ callbackUrl: '/signin' });
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.avatarBtn}
        aria-label="Tài khoản người dùng"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={name || email || 'Tài khoản'}
      >
        {avatarInner}
      </button>

      {open && (
        <>
          {/* click outside để đóng */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 55 }} aria-hidden onClick={() => setOpen(false)} />
          <div className={styles.panel} role="menu" aria-label="Tài khoản người dùng" ref={panelRef}>
            <div className={styles.head}>
              <div className={styles.headAvatar}>
                {!photoFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/api/me/photo" alt="" onError={() => setPhotoFailed(true)} />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className={styles.headInfo}>
                <div className={styles.name}>{name || 'Người dùng'}</div>
                {email && <div className={styles.email}>{email}</div>}
                {role && <span className={styles.role}>{role}</span>}
              </div>
            </div>

            <hr className={styles.divider} />

            <div className={styles.menu}>
              <button type="button" role="menuitem" className={styles.item} onClick={() => setOpen(false)}>
                <Icon name="user" /> Thông tin tài khoản
              </button>
              <button type="button" role="menuitem" className={styles.item} onClick={() => setOpen(false)}>
                <Icon name="settings" /> Cài đặt
              </button>
              <button type="button" role="menuitem" className={styles.item} onClick={() => setOpen(false)}>
                <Icon name="help" /> Trợ giúp
              </button>
            </div>

            {showLogout && (
              <>
                <hr className={styles.divider} />
                <div className={styles.menu}>
                  <button type="button" role="menuitem" className={`${styles.item} ${styles.logout}`} onClick={onLogout}>
                    <Icon name="logout" /> Đăng xuất
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
