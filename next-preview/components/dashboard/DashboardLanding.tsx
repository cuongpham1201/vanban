'use client';

import * as React from 'react';
import Link from 'next/link';
import Icon, { IconName } from '@/components/shell/Icon';

interface DashTotals {
  totalDocuments: number;
  activeDocuments: number;
  expiredDocuments: number;
  needsReview: number;
}
interface DashResponse {
  ok: boolean;
  totals?: DashTotals;
  error?: string;
}

interface QuickAction {
  href: string;
  icon: IconName;
  title: string;
  desc: string;
  primary?: boolean;
  disabled?: boolean;
  badge?: string;
}

const ACTIONS: QuickAction[] = [
  { href: '/search', icon: 'search', title: 'Tra cứu văn bản', desc: 'Tìm theo số VB, trích yếu, người ký, bộ lọc.', primary: true },
  { href: '/upload', icon: 'upload', title: 'Tải lên văn bản', desc: 'Thêm văn bản mới kèm thông tin mô tả.' },
  { href: '/replace', icon: 'replace', title: 'Thay thế văn bản', desc: 'Thay bản cũ bằng phiên bản mới.' },
];

const KPIS: { key: keyof DashTotals; label: string }[] = [
  { key: 'totalDocuments', label: 'Tổng văn bản' },
  { key: 'activeDocuments', label: 'Đang lưu hành' },
  { key: 'expiredDocuments', label: 'Hết hiệu lực' },
  { key: 'needsReview', label: 'Cần rà soát' },
];

export default function DashboardLanding(): React.ReactElement {
  const [totals, setTotals] = React.useState<DashTotals | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    // KPI nhẹ — aggregate ~2KB, read-only. Lỗi/loading → hiển thị "—" (không chặn trang).
    fetch('/api/dashboard', { credentials: 'same-origin' })
      .then(async (r) => {
        const j = (await r.json()) as DashResponse;
        if (alive && r.ok && j.ok && j.totals) {
          setTotals(j.totals);
        }
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const fmt = (n: number | undefined): string =>
    typeof n === 'number' ? n.toLocaleString('vi-VN') : loaded ? '—' : '…';

  return (
    <div style={{ padding: 'var(--sp-6) var(--sp-8) var(--sp-12)', maxWidth: 1100 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="t-eyebrow" style={{ marginBottom: 6 }}>Công ty CP Bia Hạ Long</div>
        <h1 className="t-h1" style={{ margin: '0 0 6px' }}>BHL - Văn bản điều hành</h1>
        <div className="t-sm mut">Tra cứu, tải lên và quản lý văn bản điều hành tập trung.</div>
      </div>

      {/* Quick actions */}
      <div className="row gap-3 wrap" style={{ marginBottom: 'var(--sp-8)' }}>
        {ACTIONS.map((a) => {
          const inner = (
            <>
              <span
                style={{
                  width: 40, height: 40, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center',
                  flexShrink: 0, background: a.primary ? 'var(--navy-600)' : 'var(--gray-100)',
                  color: a.primary ? '#fff' : 'var(--navy-600)',
                }}
              >
                <Icon name={a.icon} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="row gap-2" style={{ alignItems: 'center' }}>
                  <span style={{ fontWeight: 650 }}>{a.title}</span>
                  {a.badge && <span className="badge badge-neutral">{a.badge}</span>}
                </span>
                <span className="t-xs mut" style={{ display: 'block', marginTop: 2 }}>{a.desc}</span>
              </span>
            </>
          );
          const baseStyle: React.CSSProperties = {
            display: 'flex', gap: 12, alignItems: 'center', padding: 'var(--sp-4)',
            width: 320, maxWidth: '100%', textAlign: 'left',
          };
          if (a.disabled) {
            return (
              <div
                key={a.href}
                className="card"
                style={{ ...baseStyle, opacity: 0.6, cursor: 'not-allowed' }}
                aria-disabled="true"
                title="Tính năng sắp có"
              >
                {inner}
              </div>
            );
          }
          return (
            <Link key={a.href} href={a.href} className="card" style={{ ...baseStyle, textDecoration: 'none', color: 'inherit' }}>
              {inner}
            </Link>
          );
        })}
      </div>

      {/* KPI tóm tắt */}
      <div className="t-eyebrow" style={{ marginBottom: 10 }}>Tổng quan nhanh</div>
      <div className="row gap-3 wrap">
        {KPIS.map((k) => (
          <div key={k.key} className="card card-pad" style={{ width: 220, maxWidth: '100%' }}>
            <div className="t-xs mut" style={{ marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 'var(--fs-h2)', fontWeight: 700, color: 'var(--navy-600)' }}>
              {fmt(totals?.[k.key])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
