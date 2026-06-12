'use client';

import * as React from 'react';
import AppBar from './AppBar';
import SideNav from './SideNav';
import GlobalShortcuts from './GlobalShortcuts';
import TeamsDeepLinkRouter from '@/components/auth/TeamsDeepLinkRouter';

const PIN_KEY = 'bhl.sidebar.pinned';

// Khung ứng dụng: appbar + sidenav + nội dung.
// BUG#16: mobile → sidebar ẩn mặc định, mở bằng ☰ (drawer + backdrop); có "Ghim menu"
// (lưu localStorage). Desktop luôn hiện sidebar.
export default function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);

  React.useEffect(() => {
    try {
      setPinned(localStorage.getItem(PIN_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const togglePin = (): void => {
    setPinned((p) => {
      const next = !p;
      try {
        localStorage.setItem(PIN_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const open = mobileOpen || pinned;

  return (
    <div className={`dms-shell${pinned ? ' pinned' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <GlobalShortcuts />
      <React.Suspense fallback={null}>
        <TeamsDeepLinkRouter />
      </React.Suspense>
      <React.Suspense fallback={<header className="appbar" />}>
        <AppBar onMenu={() => setMobileOpen((v) => !v)} />
      </React.Suspense>
      <div className="appbody" style={{ flex: 1, minHeight: 0 }}>
        {mobileOpen && !pinned && <div className="sidenav-backdrop" onClick={() => setMobileOpen(false)} />}
        <SideNav
          open={open}
          pinned={pinned}
          onTogglePin={togglePin}
          onNavigate={() => {
            if (!pinned) setMobileOpen(false);
          }}
        />
        <main className="maincol scrollbar">{children}</main>
      </div>
    </div>
  );
}
