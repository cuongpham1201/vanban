'use client';

import * as React from 'react';
import { DetailDoc } from './documentDetailTypes';
import AttachmentsPanel from './AttachmentsPanel';
import RelatedDocuments from './RelatedDocuments';
import HistoryPanel from './HistoryPanel';

export type DetailTab = 'info' | 'att' | 'rel' | 'rep' | 'tl';
type Tab = DetailTab;

function Row({ k, v }: { k: string; v: React.ReactNode }): React.ReactElement {
  return (
    <div className="mrow">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function InfoPane({ doc }: { doc: DetailDoc }): React.ReactElement {
  return (
    <>
      <Row k="Trích yếu" v={doc.title} />
      <Row k="Số văn bản" v={doc.num} />
      <Row k="Năm ban hành" v={doc.namBanHanh} />
      <Row k="Người ký" v={doc.nguoiKy} />
      <Row k="Ngày ban hành" v={doc.ngayBH} />
      <Row k="Ngày hết hiệu lực" v={doc.hetHL} />
      <Row k="Trạng thái" v={<span className={`badge ${doc.statusClass}`}>{doc.statusLabel}</span>} />
      <Row k="Mức độ bảo mật" v={<span className={`badge ${doc.baomatClass}`}><span className="dot" />{doc.baomat}</span>} />
      <Row k="Đơn vị phát hành" v={doc.donViPH} />
      <Row k="Đơn vị sở hữu" v={doc.donViSH} />

      <div className="sec-block" style={{ marginTop: 16 }}>
        <div className="h">Metadata V2 · Phân loại</div>
        <div className="row between" style={{ padding: '5px 0' }}><span className="t-xs mut">Nhóm tài liệu</span><span className="t-sm" style={{ fontWeight: 600 }}>{doc.nhom}</span></div>
        <div className="row between" style={{ padding: '5px 0' }}><span className="t-xs mut">Loại VB pháp lý</span><span className="t-sm" style={{ fontWeight: 600 }}>{doc.loaiPL}</span></div>
        <div className="row between" style={{ padding: '5px 0' }}><span className="t-xs mut">Loại tài liệu</span><span className="t-sm" style={{ fontWeight: 600 }}>{doc.loaiTL}</span></div>
        <div className="row between" style={{ padding: '5px 0' }}><span className="t-xs mut">Chủ đề nghiệp vụ</span><span className="t-sm" style={{ fontWeight: 600 }}>{doc.chude}</span></div>
      </div>

      <div className="sec-block" style={{ background: 'var(--gold-050)', borderColor: 'var(--gold-200)' }}>
        <div className="h" style={{ color: 'var(--gold-700)' }}>Độ tin cậy metadata</div>
        {doc.conf ? (
          <div className="row gap-3" style={{ marginBottom: 8 }}>
            <span className="conf-bar" style={{ width: 120, height: 8 }}>
              <i style={{ width: `${doc.conf.pct}%`, background: doc.conf.color }} />
            </span>
            <span className="t-sm" style={{ fontWeight: 700, color: doc.conf.color }}>{doc.conf.label}</span>
          </div>
        ) : (
          <div className="t-sm mut" style={{ marginBottom: 8 }}>—</div>
        )}
        <div className="row between" style={{ padding: '4px 0' }}><span className="t-xs mut">Nguồn metadata</span><span className="t-xs" style={{ fontWeight: 600 }}>{doc.nguon}</span></div>
        <div className="row between" style={{ padding: '4px 0' }}>
          <span className="t-xs mut">File nguồn chỉnh sửa</span>
          {doc.editable ? <span className="badge badge-ok" style={{ padding: '2px 8px' }}>✎ Có</span> : <span className="badge badge-neutral" style={{ padding: '2px 8px' }}>Không có</span>}
        </div>
        {doc.editableSourceUrl && (
          <div className="row between" style={{ padding: '4px 0' }}>
            <span className="t-xs mut">EditableSourceUrl</span>
            <a className="t-xs" style={{ color: 'var(--navy-600)', fontWeight: 600 }} href={doc.editableSourceUrl} target="_blank" rel="noreferrer">Mở</a>
          </div>
        )}
        {doc.primaryPdfUrl && (
          <div className="row between" style={{ padding: '4px 0' }}>
            <span className="t-xs mut">PrimaryPdfUrl</span>
            <a className="t-xs" style={{ color: 'var(--navy-600)', fontWeight: 600 }} href={doc.primaryPdfUrl} target="_blank" rel="noreferrer">Mở</a>
          </div>
        )}
      </div>

      <div className="mrow" style={{ border: 0 }}>
        <span className="k">Tags</span>
        <span className="v row gap-1 wrap">
          {doc.tags.length ? doc.tags.map((t) => <span className="tag" key={t}>#{t}</span>) : '—'}
        </span>
      </div>
    </>
  );
}

function RepPane({ doc }: { doc: DetailDoc }): React.ReactElement {
  return (
    <>
      <div className="sec-block" style={{ background: 'var(--navy-050)', borderColor: 'var(--navy-100)' }}>
        <div className="h" style={{ color: 'var(--navy-600)' }}>Văn bản này thay thế</div>
        {doc.thaythe ? (
          <div className="relrow" style={{ background: '#fff', margin: 0 }}>
            <div className="ficon" style={{ background: 'var(--gray-150)', color: 'var(--gray-500)' }}>PDF</div>
            <div style={{ flex: 1 }}>
              <div className="num">{doc.thaythe}</div>
            </div>
          </div>
        ) : (
          <div className="dd-empty">Không thay thế văn bản nào.</div>
        )}
      </div>
      <div className="sec-block">
        <div className="h">Bị thay thế bởi</div>
        <div className="dd-empty">Chưa có — đây là phiên bản hiện hành (dữ liệu chuỗi thay thế V3 sẽ bổ sung sau).</div>
      </div>
    </>
  );
}

// Panel metadata bên phải — port từ DocumentDetail.html .meta + tabs.
// BUG#27: tab là CONTROLLED (state ở DocumentDetailPage) để quyết định việc render PDF trên mobile.
export default function MetadataPanel({
  doc,
  tab: tabProp,
  onTab,
}: {
  doc: DetailDoc;
  tab?: Tab;
  onTab?: (t: Tab) => void;
}): React.ReactElement {
  const [tabLocal, setTabLocal] = React.useState<Tab>('info');
  const tab = tabProp ?? tabLocal;
  const setTab = (t: Tab): void => {
    if (onTab) onTab(t);
    else setTabLocal(t);
  };
  const attN = doc.editable && doc.editableSourceUrl ? 1 : 0;
  const relN = doc.relatedList.length;
  const repN = doc.thaythe ? 1 : 0;
  const tabs: [Tab, string, number][] = [
    ['info', 'Thông tin', 0],
    ['att', 'Đính kèm', attN],
    ['rel', 'Liên quan', relN],
    ['rep', 'Thay thế', repN],
    ['tl', 'Lịch sử', 0],
  ];
  return (
    <aside className="dd-meta">
      <div className="mtabs">
        {tabs.map(([t, l, n]) => (
          <button key={t} className={`mtab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {l}
            {n ? <span className="n">{n}</span> : null}
          </button>
        ))}
      </div>
      <div className="mcontent scrollbar">
        {tab === 'info' && <InfoPane doc={doc} />}
        {tab === 'att' && <AttachmentsPanel doc={doc} />}
        {tab === 'rel' && <RelatedDocuments doc={doc} />}
        {tab === 'rep' && <RepPane doc={doc} />}
        {tab === 'tl' && <HistoryPanel />}
      </div>
    </aside>
  );
}
