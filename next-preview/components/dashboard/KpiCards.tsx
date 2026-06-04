'use client';

import * as React from 'react';
import Icon, { IconName } from '@/components/shell/Icon';
import { Kpis, EXPIRING_WINDOW_DAYS } from './dashboardTypes';

// KPI cards — port .kpi từ Dashboard.html. 4 chỉ số từ dữ liệu thật.
interface KpiDef {
  key: keyof Kpis;
  label: string;
  icon: IconName;
  bg: string;
  fg: string;
  note?: string;
}

const DEFS: KpiDef[] = [
  { key: 'total', label: 'Tổng số văn bản', icon: 'docs', bg: 'var(--navy-050)', fg: 'var(--navy-600)' },
  { key: 'active', label: 'Đang hiệu lực', icon: 'docs', bg: 'var(--success-100)', fg: 'var(--success-700)' },
  { key: 'expired', label: 'Hết hiệu lực', icon: 'archive', bg: 'var(--info-100)', fg: 'var(--info-700)' },
  { key: 'expiringSoon', label: 'Sắp hết hiệu lực', icon: 'clock', bg: 'var(--gold-100)', fg: 'var(--gold-700)', note: `≤ ${EXPIRING_WINDOW_DAYS} ngày` },
];

export default function KpiCards({ kpis, loading }: { kpis: Kpis | null; loading: boolean }): React.ReactElement {
  return (
    <div className="db-kpis">
      {DEFS.map((d) => (
        <div className="kpi" key={d.key}>
          {d.note && <span className="delta" style={{ color: d.fg }}>{d.note}</span>}
          <div className="ic" style={{ background: d.bg, color: d.fg }}><Icon name={d.icon} /></div>
          <div className="num">{loading || !kpis ? '…' : kpis[d.key].toLocaleString('vi-VN')}</div>
          <div className="lbl">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
