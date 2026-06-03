import * as React from 'react';

// Phase 1 — trang render shell (route /dashboard, maps Dashboard.html).
// Nội dung Dashboard thật (KPI/widget) sẽ làm ở Phase 7. Hiện chỉ xác nhận
// AppShell + AppBar + SideNav + design system (ds.css) hoạt động.
export default function DashboardPage(): React.ReactElement {
  return (
    <div style={{ padding: 'var(--sp-6) var(--sp-8) var(--sp-12)', maxWidth: 1280 }}>
      <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 'var(--sp-6)' }}>
        <div>
          <h1 className="t-h1" style={{ margin: '0 0 4px' }}>Giao diện DMS V2 — App Shell</h1>
          <div className="t-sm mut">
            Phase 1: AppShell + AppBar + SideNav + design system (ds.css). Chạy song song UI cũ ở “/”.
          </div>
        </div>
        <div className="row gap-2">
          <button className="btn btn-ghost">Xuất báo cáo</button>
          <button className="btn btn-gold">Tải lên văn bản</button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="t-eyebrow" style={{ marginBottom: 10 }}>Kiểm tra design system (ds.css)</div>
        <div className="row gap-2 wrap" style={{ marginBottom: 14 }}>
          <span className="badge badge-ok"><span className="dot" />Hiệu lực</span>
          <span className="badge badge-warn"><span className="dot" />Mật</span>
          <span className="badge badge-danger">Hết hiệu lực</span>
          <span className="badge badge-navy">Có bản mềm</span>
          <span className="chip active">Năm 2024 <span className="x">×</span></span>
          <span className="tag">#chất lượng</span>
        </div>
        <div className="row gap-3 wrap">
          <button className="btn btn-primary">Nút chính</button>
          <button className="btn btn-subtle">Nút nhạt</button>
          <span className="conf">
            <span className="conf-bar"><i style={{ width: '96%', background: 'var(--conf-high)' }} /></span>
            <span style={{ color: 'var(--conf-high)' }}>96% · Cao</span>
          </span>
        </div>
      </div>

      <div className="card card-pad t-sm mut">
        Các màn hình tiếp theo sẽ dựng theo mapping:
        <code className="t-mono"> Dashboard→/dashboard · SearchCenter→/search · DocumentDetail→/documents/[id] ·
        UploadWizard→/upload · ReplaceDocument→/replace</code> (Phase 2–7).
      </div>
    </div>
  );
}
