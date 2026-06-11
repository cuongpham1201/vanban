'use client';

import * as React from 'react';
import { DetailDoc } from './documentDetailTypes';
import SoftCopyPanel from './SoftCopyPanel';
import AttachmentsPanel from './AttachmentsPanel';
import RelatedDocuments from './RelatedDocuments';
import ReplacementPanel from './ReplacementPanel';
import HistoryPanel from './HistoryPanel';

export type DetailTab = 'info' | 'soft' | 'att' | 'rel' | 'rep' | 'tl';
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
      <Row k="Đơn vị soạn thảo" v={doc.donViPH} />
      <Row k="Cấp lưu trữ" v={doc.donViSH} />

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

// Panel metadata bên phải — port từ DocumentDetail.html .meta + tabs.
// BUG#27: tab là CONTROLLED (state ở DocumentDetailPage) để quyết định việc render PDF trên mobile.
export default function MetadataPanel({
  doc,
  tab: tabProp,
  onTab,
  canWrite = false,
  onChanged,
}: {
  doc: DetailDoc;
  tab?: Tab;
  onTab?: (t: Tab) => void;
  canWrite?: boolean;
  onChanged?: (msg?: string) => void;
}): React.ReactElement {
  const [tabLocal, setTabLocal] = React.useState<Tab>('info');
  const tab = tabProp ?? tabLocal;
  const setTab = (t: Tab): void => {
    if (onTab) onTab(t);
    else setTabLocal(t);
  };
  const notify = onChanged ?? ((): void => undefined);
  const softN = doc.editable && doc.editableSourceUrl ? 1 : 0;
  const relN = doc.relatedList.length;
  const repN = doc.thaythe ? 1 : 0;
  const tabs: [Tab, string, number][] = [
    ['info', 'Thông tin', 0],
    ['soft', 'Bản mềm', softN],
    ['att', 'File đính kèm', 0],
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
        {tab === 'soft' && (
          <SoftCopyPanel
            docId={doc.id}
            editableSourceUrl={doc.editableSourceUrl}
            editableSourceName={doc.editableSourceName}
            canWrite={canWrite}
            onChanged={notify}
          />
        )}
        {tab === 'att' && <AttachmentsPanel docId={doc.id} soVanBan={doc.num} canWrite={canWrite} onChanged={notify} />}
        {tab === 'rel' && (
          <RelatedDocuments docId={doc.id} soVanBan={doc.num} relatedList={doc.relatedList} canWrite={canWrite} onChanged={notify} />
        )}
        {tab === 'rep' && <ReplacementPanel docId={doc.id} soVanBan={doc.num} thaythe={doc.thaythe} canWrite={canWrite} onChanged={notify} />}
        {tab === 'tl' && <HistoryPanel docId={doc.id} />}
      </div>
    </aside>
  );
}
