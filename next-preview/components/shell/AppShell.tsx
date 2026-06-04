import * as React from 'react';
import AppBar from './AppBar';
import SideNav from './SideNav';
import GlobalShortcuts from './GlobalShortcuts';

// Khung ứng dụng: appbar trên + sidenav trái + vùng nội dung.
// Cấu trúc khớp dms-design (.screen > header.appbar + .appbody > aside.sidenav + main.maincol).
// Class `dms-shell` bật reset/font của ds.css CHỈ trong shell này (không ảnh hưởng UI cũ ở "/").
export default function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="dms-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <GlobalShortcuts />
      <AppBar />
      <div className="appbody" style={{ flex: 1, minHeight: 0 }}>
        <SideNav />
        <main className="maincol scrollbar">{children}</main>
      </div>
    </div>
  );
}
