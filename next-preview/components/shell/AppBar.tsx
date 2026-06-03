import * as React from 'react';
import Icon from './Icon';

// Thanh trên cùng (appbar) — port từ dms-design/assets/shell.js.
// Phase 1: tĩnh, chưa hook dữ liệu thật (avatar/global search là placeholder).
export default function AppBar(): React.ReactElement {
  return (
    <header className="appbar">
      <div className="logo">
        <span className="mark" />
        <span>
          BHL <span style={{ fontWeight: 500, opacity: 0.7 }}>DMS</span>
        </span>
      </div>
      <div className="spacer" />
      <div className="gsearch" role="search" title="Tìm văn bản (Ctrl K)">
        <Icon name="search" size={18} />
        <span>Tìm văn bản, số VB, người ký…</span>
        <span className="kbd">Ctrl K</span>
      </div>
      <div className="spacer" />
      <div className="iconbtn" title="Tải lên">
        <Icon name="upload" />
      </div>
      <div className="iconbtn" title="Thông báo" style={{ position: 'relative' }}>
        <Icon name="bell" />
        <span
          style={{
            position: 'absolute', top: 6, right: 7, width: 7, height: 7, borderRadius: '50%',
            background: 'var(--gold-500)', border: '1.5px solid var(--navy-700)',
          }}
        />
      </div>
      <div className="iconbtn" title="Trợ giúp">
        <Icon name="help" />
      </div>
      <div className="avatar" title="Người dùng">
        NL
      </div>
    </header>
  );
}
