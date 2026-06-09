'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { IconName } from './Icon';
import { useDmsWrite } from '@/lib/client/useDmsWrite';

// Điều hướng trái (sidenav) — port từ dms-design/assets/shell.js.
// Route đặt dưới app/(dms)/* để chạy SONG SONG UI cũ (ở "/"). Phase 2-7 bổ sung trang.
interface NavDef {
  href: string;
  label: string;
  icon: IconName;
  count?: string;
}

// Route theo mapping bắt buộc: app/(dms)/dashboard|search|documents/[id]|upload|replace.
// Bỏ count hardcode (số fake). "Bộ sưu tập" (Đang xử lý/Đã ghim/Sắp hết hiệu lực) ẩn vì
// chưa có nghiệp vụ thật — bật lại khi có count thật.
const MAIN: NavDef[] = [
  { href: '/dashboard', label: 'Tổng quan', icon: 'dashboard' },
  { href: '/search', label: 'Tìm kiếm', icon: 'search' },
  { href: '/documents', label: 'Tất cả văn bản', icon: 'docs' },
];
const TASKS: NavDef[] = [
  { href: '/upload', label: 'Tải lên văn bản', icon: 'upload' },
  { href: '/replace', label: 'Thay thế văn bản', icon: 'replace' },
];
const SYSTEM: NavDef[] = [{ href: '/admin', label: 'Quản trị', icon: 'admin' }];

export default function SideNav({
  open,
  pinned,
  onTogglePin,
  onNavigate,
}: {
  open?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  onNavigate?: () => void;
} = {}): React.ReactElement {
  const pathname = usePathname() || '/dashboard';
  // #38/#16: menu "Tác vụ" (Tải lên/Thay thế) và "Hệ thống" (Quản trị) CHỈ hiện khi có DMS write.
  // Nguồn quyền dùng chung qua useDmsWrite() — không hardcode, không lặp logic.
  const canWrite = useDmsWrite() === true;

  const isActive = (href: string): boolean => {
    const base = href.split('?')[0];
    return pathname === base || pathname.startsWith(base + '/');
  };

  const item = (n: NavDef): React.ReactElement => (
    <Link
      key={n.href + n.label}
      href={n.href}
      className={`nav-item ${isActive(n.href) ? 'active' : ''}`}
      onClick={() => onNavigate?.()}
    >
      <Icon name={n.icon} />
      <span>{n.label}</span>
      {n.count ? <span className="count">{n.count}</span> : null}
    </Link>
  );

  return (
    <aside className={`sidenav scrollbar${open ? ' open' : ''}`}>
      {MAIN.map(item)}
      {canWrite && (
        <>
          <div className="nav-sec">Tác vụ</div>
          {TASKS.map(item)}
        </>
      )}
      <div style={{ flex: 1 }} />
      {canWrite && (
        <>
          <div className="nav-sec">Hệ thống</div>
          {SYSTEM.map(item)}
        </>
      )}
      {onTogglePin && (
        <button type="button" className="nav-pin" onClick={onTogglePin} title={pinned ? 'Bỏ ghim menu' : 'Ghim menu'}>
          <Icon name="pin" size={16} /> {pinned ? 'Bỏ ghim menu' : 'Ghim menu'}
        </button>
      )}
    </aside>
  );
}
