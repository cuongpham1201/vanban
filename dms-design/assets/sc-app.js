/* BHL DMS — Search Center interactions */
(function () {
  renderShell({ active: 'search' });
  const I = window.ICON;

  // replace icon placeholders in static markup
  document.body.innerHTML = document.body.innerHTML
    .replace('__COLS__', I.cols).replace('__LIST__', I.list).replace('__GRID__', I.grid)
    .replace('__SEARCH__', I.search).replace('__PLUS__', I.plus).replace('__STAR__', I.star);
  // re-render shell (innerHTML swap wiped listeners but shell is static markup, re-run)
  renderShell({ active: 'search' });

  const confColor = c => c >= 85 ? 'var(--conf-high)' : c >= 65 ? 'var(--conf-mid)' : 'var(--conf-low)';
  const confLabel = c => c >= 85 ? 'Cao' : c >= 65 ? 'Trung bình' : 'Thấp';
  const secBadge = b => {
    const map = { 'Công khai': 'badge-ok', 'Nội bộ': 'badge-info', 'Mật': 'badge-warn', 'Tối mật': 'badge-danger' };
    return `<span class="badge ${map[b] || 'badge-neutral'}"><span class="dot"></span>${b}</span>`;
  };
  const statusBadge = s => {
    const map = { 'Hiệu lực': 'badge-ok', 'Sắp hết hiệu lực': 'badge-warn', 'Hết hiệu lực': 'badge-danger', 'Dự thảo': 'badge-neutral' };
    return `<span class="badge ${map[s] || 'badge-neutral'}">${s}</span>`;
  };

  // ---- Filters ----
  const fp = document.getElementById('filterPanel');
  fp.innerHTML = `<div class="row between" style="margin-bottom:16px">
      <span class="t-eyebrow">Bộ lọc</span>
      <span class="t-xs" style="color:var(--navy-600);font-weight:600;cursor:pointer">Xoá tất cả</span>
    </div>` + window.FILTERS.map(g => `
    <div class="fgroup">
      <div class="fhead">${g.label}<span style="transform:rotate(${g.open ? 0 : -90}deg)">${I.chevdown}</span></div>
      <div class="fbody" style="${g.open ? '' : 'display:none'}">
        ${g.items.map((it, i) => `<label class="frow">
          <input type="checkbox" ${(g.key === 'nam' && it[0] === '2024') || (g.key === 'baomat' && false) ? 'checked' : ''}>
          <span>${it[0]}</span><span class="n">${it[1].toLocaleString('vi-VN')}</span>
        </label>`).join('')}
        ${g.items.length > 5 ? `<div class="t-xs" style="color:var(--navy-600);font-weight:600;cursor:pointer;margin-top:6px">Xem thêm…</div>` : ''}
      </div>
    </div>`).join('');
  fp.querySelectorAll('.fhead').forEach(h => h.addEventListener('click', () => {
    const b = h.nextElementSibling, ch = h.querySelector('span');
    const hidden = b.style.display === 'none';
    b.style.display = hidden ? '' : 'none';
    ch.style.transform = `rotate(${hidden ? 0 : -90}deg)`;
  }));

  // mirror facets into top filter bar for list/cards modes
  document.getElementById('topbar2').innerHTML =
    `<span class="t-xs mut" style="font-weight:600">${I.filter} Lọc nhanh:</span>` +
    ['Nhóm tài liệu', 'Đơn vị phát hành', 'Loại VB', 'Năm', 'Trạng thái', 'Bảo mật']
      .map(l => `<span class="chip">${l} ${I.chevdown}</span>`).join('') +
    `<span class="chip active" style="margin-left:6px">2024 <span class="x">×</span></span>`;

  // ---- Document list ----
  const list = document.getElementById('docList');
  const grid = document.getElementById('cardGrid');
  function rowHTML(d, i) {
    return `<div class="docrow ${i === 0 ? 'sel' : ''}" data-i="${i}">
      <div class="top">
        <div class="ficon ${d.type === 'doc' ? 'doc' : ''}">${d.type === 'doc' ? 'DOC' : 'PDF'}</div>
        <div style="flex:1;min-width:0">
          <div class="row gap-2" style="margin-bottom:2px">
            <span class="num">${d.num}</span>
            ${d.softcopy ? '' : '<span class="badge badge-danger" style="padding:2px 7px">Thiếu bản mềm</span>'}
            ${d.editable ? '<span class="tag" title="Có file nguồn chỉnh sửa">✎ nguồn</span>' : ''}
          </div>
          <h3>${d.title}</h3>
        </div>
        <div class="rowbadges">
          ${statusBadge(d.trangThai)}
          <span class="conf" title="Độ tin cậy metadata: ${d.conf}% · ${d.nguon}">
            <span class="conf-bar"><i style="width:${d.conf}%;background:${confColor(d.conf)}"></i></span>${d.conf}%
          </span>
        </div>
      </div>
      <div class="meta">
        <span><b>${d.donViPH}</b></span>
        <span>Ký: <b>${d.nguoiKy}</b></span>
        <span>${d.ngayBH}</span>
        <span>${secBadge(d.baomat).replace('badge', 'badge')}</span>
        ${d.tags.map(t => `<span class="tag">#${t}</span>`).join('')}
      </div>
    </div>`;
  }
  list.innerHTML = window.DOCS.map(rowHTML).join('');

  grid.innerHTML = window.DOCS.map((d, i) => `
    <div class="dcard" data-i="${i}">
      <div class="thumb"><div class="mini"></div></div>
      <div class="body">
        <div class="row gap-2" style="margin-bottom:6px"><span class="num" style="font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:600;color:var(--navy-600)">${d.num}</span></div>
        <div style="font-size:var(--fs-sm);font-weight:600;line-height:1.3;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${d.title}</div>
        <div class="row between"><span class="t-2xs mut">${d.donViPH}</span>${statusBadge(d.trangThai)}</div>
      </div>
    </div>`).join('');

  // ---- Preview pane ----
  const pv = document.getElementById('previewPane');
  function renderPreview(d) {
    pv.innerHTML = `
      <div class="pv-head">
        <div class="row between" style="margin-bottom:10px">
          <span class="num" style="font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:700;color:var(--navy-600)">${d.num}</span>
          <div class="row gap-1">
            <button class="btn btn-ghost btn-icon" title="Ghim">${I.pin}</button>
            <button class="btn btn-ghost btn-icon" title="Tải xuống">${I.download}</button>
            <button class="btn btn-ghost btn-icon" title="Chia sẻ">${I.share}</button>
          </div>
        </div>
        <div class="t-h3" style="margin-bottom:10px">${d.title}</div>
        <div class="row gap-2 wrap">${statusBadge(d.trangThai)} ${secBadge(d.baomat)}
          ${d.softcopy ? '<span class="badge badge-ok"><span class="dot"></span>Có bản mềm</span>' : '<span class="badge badge-danger">Thiếu bản mềm</span>'}
        </div>
        <div class="row gap-2" style="margin-top:14px">
          <a class="btn btn-primary" style="flex:1;justify-content:center" href="DocumentDetail.html">Mở chi tiết</a>
          <button class="btn btn-gold">${I.download}</button>
        </div>
      </div>
      <div class="pv-doc">
        <div class="page">
          <div class="gov"><b>CÔNG TY CỔ PHẦN BIA HẠ LONG</b><br>${d.donViPH}<br>—————<br>Số: ${d.num}</div>
          <div style="text-align:center;margin:14px 0"><b>CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br>Độc lập – Tự do – Hạnh phúc</div>
          <div style="text-align:center;font-weight:700;margin:16px 0 8px">${d.loaiPL.toUpperCase()}</div>
          <div style="text-align:center;font-style:italic;margin-bottom:14px">V/v ${d.title.toLowerCase()}</div>
          <div style="line-height:1.8;color:#666">${'▔'.repeat(46)}<br>${'▔'.repeat(44)}<br>${'▔'.repeat(46)}<br>${'▔'.repeat(40)}<br><br>${'▔'.repeat(45)}<br>${'▔'.repeat(43)}<br>${'▔'.repeat(38)}</div>
        </div>
      </div>
      <div class="pvtabs">
        <div class="pvtab on">Thông tin</div><div class="pvtab">Liên quan</div><div class="pvtab">Lịch sử</div>
      </div>
      <div class="pv-meta">
        ${[
          ['Trích yếu', d.trichyeu],
          ['Người ký', `${d.nguoiKy} · ${d.chucVu}`],
          ['Ngày ban hành', d.ngayBH],
          ['Ngày hết hiệu lực', d.hetHL],
          ['Nhóm tài liệu', d.nhom],
          ['Loại tài liệu', d.loaiTL],
          ['Chủ đề nghiệp vụ', d.chude],
          ['Đơn vị sở hữu', d.donViSH],
        ].map(([k, v]) => `<div class="mrow"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
        <div class="mrow"><span class="k">Độ tin cậy metadata</span><span class="v"><span class="conf"><span class="conf-bar"><i style="width:${d.conf}%;background:${confColor(d.conf)}"></i></span>${d.conf}% · ${confLabel(d.conf)}</span></span></div>
        <div class="mrow"><span class="k">Nguồn metadata</span><span class="v">${d.nguon}</span></div>
        <div class="mrow"><span class="k">File nguồn</span><span class="v">${d.editable ? '✎ Có (.docx)' : '— Không có'}</span></div>
        ${d.thaythe ? `<div class="mrow"><span class="k">Thay thế</span><span class="v"><a href="#" style="color:var(--navy-600)">${d.thaythe}</a></span></div>` : ''}
        <div class="mrow" style="border:0"><span class="k">Tags</span><span class="v row gap-1 wrap">${d.tags.map(t => `<span class="tag">#${t}</span>`).join('')}</span></div>
      </div>`;
  }
  renderPreview(window.DOCS[0]);

  function select(i) {
    list.querySelectorAll('.docrow').forEach(r => r.classList.toggle('sel', +r.dataset.i === i));
    renderPreview(window.DOCS[i]);
  }
  list.addEventListener('click', e => { const r = e.target.closest('.docrow'); if (r) select(+r.dataset.i); });
  grid.addEventListener('click', e => { const c = e.target.closest('.dcard'); if (c) { setMode('3col'); select(+c.dataset.i); } });

  // ---- Mode switching ----
  const screen = document.querySelector('.screen');
  function setMode(m) {
    screen.dataset.mode = m;
    document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    list.classList.toggle('hidden', m === 'cards');
    grid.classList.toggle('hidden', m !== 'cards');
  }
  document.getElementById('modeSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (b) setMode(b.dataset.mode);
  });
})();
