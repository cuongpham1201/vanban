'use client';

import * as React from 'react';
import Link from 'next/link';
import Icon, { IconName } from '@/components/shell/Icon';
import { Kpis, DistItem, RecentDoc } from './dashboardTypes';
import KpiCards from './KpiCards';
import DocumentTypeChart from './DocumentTypeChart';
import DepartmentChart from './DepartmentChart';
import YearChart from './YearChart';
import RecentDocuments from './RecentDocuments';

interface DashCharts {
  kpis: Kpis;
  byType: DistItem[];
  byDept: DistItem[];
  byYear: DistItem[];
  recent: RecentDoc[];
}
interface DashResponse {
  ok: boolean;
  charts?: DashCharts;
  error?: string;
}

interface QuickAction {
  href: string;
  icon: IconName;
  title: string;
  desc: string;
  primary?: boolean;
}

const ACTIONS: QuickAction[] = [
  { href: '/search', icon: 'search', title: 'Tra cứu văn bản', desc: 'Tìm theo số VB, trích yếu, người ký, bộ lọc.', primary: true },
  { href: '/upload', icon: 'upload', title: 'Tải lên văn bản', desc: 'Thêm văn bản mới kèm thông tin mô tả.' },
  { href: '/replace', icon: 'replace', title: 'Thay thế văn bản', desc: 'Liên kết bản mới với bản cũ.' },
];

// BUG#11: cache client → back/đổi trang không blank, render cache + refresh nền.
let _dashCache: DashCharts | undefined;

// Drill-down: build href /search?<facetKey>=<value> (seed filter ở Search Center).
const drill = (key: string, value: string): string =>
  `/search?${key}=${encodeURIComponent(value)}`;

// Dashboard nghiệp vụ (read-only). MỘT lần GET /api/documents → tổng hợp client-side.
export default function DashboardPage(): React.ReactElement {
  const [data, setData] = React.useState<DashCharts | null>(_dashCache ?? null);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    let alive = true;
    // P: dùng /api/dashboard (aggregate) thay vì kéo full /api/documents → cắt payload ~132KB → ~6KB.
    fetch('/api/dashboard', { credentials: 'same-origin' })
      .then(async (r) => {
        const j = (await r.json()) as DashResponse;
        if (!r.ok || !j.ok || !j.charts) {
          throw new Error(j?.error ?? `Lỗi tải dữ liệu (HTTP ${r.status}).`);
        }
        _dashCache = j.charts;
        if (alive) {
          setData(_dashCache);
        }
      })
      .catch((e: Error) => alive && !_dashCache && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const loading = data === null && !error;
  const kpis: Kpis | null = data ? data.kpis : null;
  const byType: DistItem[] = data?.byType ?? [];
  const byDept: DistItem[] = data?.byDept ?? [];
  const byYear: DistItem[] = data?.byYear ?? [];
  const recent: RecentDoc[] = data?.recent ?? [];

  return (
    <div className="db-root scrollbar">
      <div className="page">
        <div className="pagehead">
          <div>
            <h1>Tổng quan</h1>
            <div className="t-sm mut">Tổng quan kho văn bản điều hành — số liệu lấy trực tiếp từ kho.</div>
          </div>
          <div className="row gap-2">
            <Link className="btn btn-gold" href="/upload"><Icon name="upload" /> Tải lên văn bản</Link>
          </div>
        </div>

        {error && (
          <div className="db-error">Không tải được dữ liệu: {error}</div>
        )}

        <KpiCards
          kpis={kpis}
          loading={loading}
          hrefFor={(key) =>
            key === 'total'
              ? '/search'
              : key === 'active'
              ? drill('trangThai', 'Đang lưu hành')
              : key === 'expired'
              ? drill('trangThai', 'Hết hiệu lực')
              : key === 'expiringSoon'
              ? // Khớp đúng nhãn facet trạng thái (statusOf → 'Sắp hết hiệu lực' khi còn hiệu lực + ≤30 ngày).
                drill('trangThai', 'Sắp hết hiệu lực')
              : '/search'
          }
        />

        {/* Truy cập nhanh */}
        <div className="db-quick">
          {ACTIONS.map((a) => (
            <Link key={a.href} href={a.href} className={`db-quick-card ${a.primary ? 'primary' : ''}`}>
              <span className="db-quick-ic"><Icon name={a.icon} /></span>
              <span style={{ minWidth: 0 }}>
                <span className="db-quick-t">{a.title}</span>
                <span className="db-quick-d">{a.desc}</span>
              </span>
            </Link>
          ))}
        </div>

        {/* Nội dung: trái = mới nhất + năm · phải = loại + đơn vị */}
        <div className="grid2">
          <div>
            <RecentDocuments docs={recent} loading={loading} />
            <YearChart items={byYear} loading={loading} hrefFor={(label) => drill('namBanHanh', label)} />
          </div>
          <div>
            <DocumentTypeChart items={byType} loading={loading} hrefFor={(label) => drill('loaiVanBanPhapLy', label)} />
            <DepartmentChart items={byDept} loading={loading} hrefFor={(label) => drill('donViPhatHanh', label)} />
          </div>
        </div>
      </div>
    </div>
  );
}
