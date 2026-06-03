'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { IconName } from './Icon';

// Điều hướng trái (sidenav) — port từ dms-design/assets/shell.js.
// Route đặt dưới app/(dms)/* để chạy SONG SONG UI cũ (ở "/"). Phase 2-7 bổ sung trang.
interface NavDef {
  href: string;
  label: string;
  icon: IconName;
  count?: string;
}

// Route theo mapping bắt buộc: app/(dms)/dashboard|search|documents/[id]|upload|replace.
const MAIN: NavDef[] = [
  { href: '/dashboard', label: 'Tổng quan', icon: 'dashboard' },
  { href: '/search', label: 'Tìm kiếm', icon: 'search' },
  { href: '/documents', label: 'Tất cả văn bản', icon: 'docs', count: '4.182' },
];
const TASKS: NavDef[] = [
  { href: '/upload', label: 'Tải lên văn bản', icon: 'upload' },
  { href: '/replace', label: 'Thay thế văn bản', icon: 'replace' },
];
const COLLECTIONS: NavDef[] = [
  { href: '/search?view=processing', label: 'Đang xử lý của tôi', icon: 'clock', count: '12' },
  { href: '/search?view=pinned', label: 'Đã ghim', icon: 'star', count: '8' },
  { href: '/search?view=expiring', label: 'Sắp hết hiệu lực', icon: 'archive', count: '23' },
];
const SYSTEM: NavDef[] = [{ href: '/admin', label: 'Quản trị', icon: 'admin' }];

export default function SideNav(): React.ReactElement {
  const pathname = usePathname() || '/dashboard';

  const isActive = (href: string): boolean => {
    const base = href.split('?')[0];
    return pathname === base || pathname.startsWith(base + '/');
  };

  const item = (n: NavDef): React.ReactElement => (
    <Link key={n.href + n.label} href={n.href} className={`nav-item ${isActive(n.href) ? 'active' : ''}`}>
      <Icon name={n.icon} />
      <span>{n.label}</span>
      {n.count ? <span className="count">{n.count}</span> : null}
    </Link>
  );

  return (
    <aside className="sidenav scrollbar">
      {MAIN.map(item)}
      <div className="nav-sec">Tác vụ</div>
      {TASKS.map(item)}
      <div className="nav-sec">Bộ sưu tập</div>
      {COLLECTIONS.map(item)}
      <div style={{ flex: 1 }} />
      <div className="nav-sec">Hệ thống</div>
      {SYSTEM.map(item)}
    </aside>
  );
}
