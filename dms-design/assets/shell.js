/* BHL DMS — shared shell + icon set for all mockups */
(function () {
  const I = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    docs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4m0 0 4 4m-4-4-4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    replace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8h13l-3-3m3 3-3 3"/><path d="M21 16H8l3-3m-3 3 3 3"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10m6 10V4m6 16v-7"/></svg>',
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    chevdown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
    chevright: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    cols: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16M15 4v16"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/></svg>',
  };
  window.ICON = I;

  function navItem(key, label, icon, count, active) {
    return `<a class="nav-item ${active ? 'active' : ''}" href="${key}.html">
      ${icon}<span>${label}</span>${count ? `<span class="count">${count}</span>` : ''}</a>`;
  }

  window.renderShell = function (opts) {
    const a = opts.active || '';
    const appbar = document.querySelector('[data-shell="appbar"]');
    const nav = document.querySelector('[data-shell="sidenav"]');
    if (appbar) {
      appbar.className = 'appbar';
      appbar.innerHTML = `
        <div class="logo"><span class="mark"></span><span>BHL <span style="font-weight:500;opacity:.7">DMS</span></span></div>
        <div class="spacer"></div>
        <div class="gsearch">${I.search}<span>Tìm văn bản, số VB, người ký…</span><span class="kbd">Ctrl K</span></div>
        <div class="spacer"></div>
        <div class="iconbtn" title="Tải lên">${I.upload}</div>
        <div class="iconbtn" title="Thông báo" style="position:relative">${I.bell}<span style="position:absolute;top:6px;right:7px;width:7px;height:7px;border-radius:50%;background:var(--gold-500);border:1.5px solid var(--navy-700)"></span></div>
        <div class="iconbtn" title="Trợ giúp">${I.help}</div>
        <div class="avatar" title="Nguyễn Thị Lan · HCNS">NL</div>`;
    }
    if (nav) {
      nav.className = 'sidenav scrollbar';
      nav.innerHTML = `
        ${navItem('Dashboard', 'Tổng quan', I.dashboard, '', a === 'dashboard')}
        ${navItem('SearchCenter', 'Tìm kiếm', I.search, '', a === 'search')}
        ${navItem('DocumentDetail', 'Tất cả văn bản', I.docs, '4.182', a === 'docs')}
        <div class="nav-sec">Tác vụ</div>
        ${navItem('UploadWizard', 'Tải lên văn bản', I.upload, '', a === 'upload')}
        ${navItem('ReplaceDocument', 'Thay thế văn bản', I.replace, '', a === 'replace')}
        <div class="nav-sec">Bộ sưu tập</div>
        ${navItem('SearchCenter', 'Đang xử lý của tôi', I.clock, '12', false)}
        ${navItem('SearchCenter', 'Đã ghim', I.star, '8', false)}
        ${navItem('SearchCenter', 'Sắp hết hiệu lực', I.archive, '23', false)}
        <div style="flex:1"></div>
        <div class="nav-sec">Hệ thống</div>
        ${navItem('Admin', 'Quản trị', I.admin, '', a === 'admin')}`;
    }
  };
})();
