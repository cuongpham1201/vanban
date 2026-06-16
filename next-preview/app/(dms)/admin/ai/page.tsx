import * as React from 'react';
import './ai-admin.css';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isWriteAllowlisted } from '@/lib/dms/writeGuard';
import { readAllAudits, AuditMetadataFields } from '@/lib/ai/auditStore';
import { computeStats, computeFieldAnalysis } from '@/lib/ai/stats';

// Route /admin/ai — Admin AI Dashboard (AI-4). Server Component: đọc auditStore + computeStats
// (CÙNG logic với GET /api/admin/ai/stats), admin-guarded. Read-only, KHÔNG ghi gì.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Dashboard · Quản lý văn bản' };

const FIELD_LABEL: Record<keyof AuditMetadataFields, string> = {
  SoVanBan: 'Số văn bản',
  LoaiVanBanPhapLy: 'Loại VB pháp lý',
  LoaiTaiLieu: 'Loại tài liệu',
  ChuDeNghiepVu: 'Chủ đề nghiệp vụ',
  TrichYeu: 'Trích yếu',
  NamBanHanh: 'Năm ban hành',
};

function fmtDate(iso: string): string {
  // YYYY-MM-DD HH:mm (tránh Date.now/locale phụ thuộc) — cắt từ ISO.
  if (!iso || iso.length < 16) return iso || '—';
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export default async function AdminAiDashboard(): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions);
  if (!isWriteAllowlisted(session)) {
    return (
      <div className="aia-root">
        <h1 className="aia-h1">AI Dashboard</h1>
        <p className="aia-sub">Chỉ quản trị viên (allowlist) được xem trang này.</p>
      </div>
    );
  }

  const records = await readAllAudits();
  const stats = computeStats(records);
  const fields = computeFieldAnalysis(records);
  const recent = [...records]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, 20);

  const pct = (n: number): number => (stats.total > 0 ? Math.round((n / stats.total) * 1000) / 10 : 0);
  const maxModified = Math.max(1, ...fields.map((f) => f.modifiedCount));

  return (
    <div className="aia-root">
      <h1 className="aia-h1">AI Dashboard</h1>
      <p className="aia-sub">Theo dõi chất lượng gợi ý metadata của AI (audit + feedback loop).</p>

      {/* B — KPI cards */}
      <div className="aia-kpis">
        <div className="aia-kpi"><div className="num">{stats.total}</div><div className="lbl">Total Suggestions</div></div>
        <div className="aia-kpi hl"><div className="num">{stats.acceptanceRate}%</div><div className="lbl">Acceptance Rate</div></div>
        <div className="aia-kpi"><div className="num">{stats.accepted}</div><div className="lbl">Accepted</div></div>
        <div className="aia-kpi"><div className="num">{stats.modified}</div><div className="lbl">Modified</div></div>
        <div className="aia-kpi"><div className="num">{stats.pending}</div><div className="lbl">Pending</div></div>
      </div>

      {/* C — Source breakdown */}
      <div className="aia-sec">Nguồn gợi ý</div>
      <div className="aia-src">
        {([
          ['AzureOpenAI', stats.bySource.AzureOpenAI],
          ['RuleBased', stats.bySource.RuleBased],
        ] as [string, number][]).map(([name, count]) => (
          <div className="aia-srcrow" key={name}>
            <div className="top">
              <span className="name">{name}</span>
              <span className="cnt">{count} · {pct(count)}%</span>
            </div>
            <div className="aia-bar"><i style={{ width: `${pct(count)}%` }} /></div>
          </div>
        ))}
      </div>

      {/* E — Field analysis (field bị sửa nhiều nhất) */}
      <div className="aia-sec">Field bị sửa nhiều nhất</div>
      <div className="aia-fields">
        {fields.map((f) => (
          <div className="aia-frow" key={f.field}>
            <span className="fname">{FIELD_LABEL[f.field] ?? f.field}</span>
            <span className="ftrack"><i style={{ width: `${Math.round((f.modifiedCount / maxModified) * 100)}%` }} /></span>
            <span className="fval">{f.modifiedCount} sửa · {f.modifyRate}%</span>
          </div>
        ))}
        {fields.every((f) => f.comparedCount === 0) && (
          <div className="aia-empty">Chưa có feedback nào để phân tích (cần record đã publish).</div>
        )}
      </div>

      {/* D — Recent audits (20 mới nhất) */}
      <div className="aia-sec">Audit gần đây (20)</div>
      <div className="aia-tblwrap">
        <table className="aia-tbl">
          <thead>
            <tr>
              <th>CreatedAt</th><th>User</th><th>Source</th><th>FileName</th><th>Accepted</th><th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td className="mono">{fmtDate(r.createdAt)}</td>
                <td>{r.userEmail}</td>
                <td><span className="aia-chip src">{r.source}</span></td>
                <td>{r.fileName || '—'}</td>
                <td>
                  {r.accepted === true ? <span className="aia-chip ok">Chấp nhận</span>
                    : r.accepted === false ? <span className="aia-chip mod">Đã sửa</span>
                    : <span className="aia-chip pend">Chờ</span>}
                </td>
                <td className="mono">{typeof r.confidence === 'number' ? `${r.confidence}%` : '—'}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr><td colSpan={6} className="aia-empty">Chưa có suggestion nào.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
