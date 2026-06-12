'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { SelectedFile, ATTACHMENT_ACCEPT } from './uploadTypes';

const ACCEPT = '.pdf';
const ACCEPT_EDITABLE = '.doc,.docx,.xls,.xlsx,.pptx';

// Bước 1 — chọn PDF chính (bắt buộc) + bản mềm DOCX/XLSX (tùy chọn) — BUG#18 multi-file MVP.
// A2: + nhiều File đính kèm (tùy chọn).
export default function FileDropzone({
  file,
  onFile,
  editableFile,
  onEditableFile,
  attachments = [],
  onAttachments,
}: {
  file: SelectedFile | null;
  onFile: (f: SelectedFile | null) => void;
  editableFile: SelectedFile | null;
  onEditableFile: (f: SelectedFile | null) => void;
  attachments?: SelectedFile[];
  onAttachments?: (f: SelectedFile[]) => void;
}): React.ReactElement {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const editRef = React.useRef<HTMLInputElement>(null);
  const attRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);

  const toSel = (f: File): SelectedFile => ({
    name: f.name,
    sizeKB: Math.max(1, Math.round(f.size / 1024)),
    ext: (f.name.split('.').pop() ?? '').toLowerCase(),
    raw: f,
  });
  const pick = (f: File | undefined): void => {
    if (f) onFile(toSel(f));
  };
  const pickEditable = (f: File | undefined): void => {
    if (f) onEditableFile(toSel(f));
  };
  const addAttachments = (files: FileList | null): void => {
    if (!onAttachments || !files || !files.length) return;
    onAttachments([...attachments, ...Array.from(files).map(toSel)]);
  };
  const removeAttachment = (idx: number): void => {
    if (!onAttachments) return;
    onAttachments(attachments.filter((_, i) => i !== idx));
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="big">
          <Icon name="upload" />
        </div>
        <div className="t-h3" style={{ marginBottom: 4 }}>Kéo thả PDF chính vào đây hoặc bấm để chọn</div>
        <div className="t-sm mut">PDF (bắt buộc) · Tối đa 50 MB</div>
      </div>

      {file && (
        <div className="filecard">
          <div className="ficon">PDF</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-sm" style={{ fontWeight: 600 }}>{file.name} <span className="badge badge-navy" style={{ padding: '1px 6px' }}>Primary PDF</span></div>
            <div className="t-2xs mut">{file.sizeKB.toLocaleString('vi-VN')} KB · PDF chính</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onFile(null)}>Bỏ chọn</button>
        </div>
      )}

      {/* Bản mềm (tùy chọn) — DOCX/XLSX/PPTX → Editable Source */}
      <input ref={editRef} type="file" accept={ACCEPT_EDITABLE} style={{ display: 'none' }} onChange={(e) => pickEditable(e.target.files?.[0])} />
      {editableFile ? (
        <div className="filecard" style={{ marginTop: 10 }}>
          <div className="ficon doc">{(editableFile.ext || 'DOC').toUpperCase().slice(0, 4)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-sm" style={{ fontWeight: 600 }}>{editableFile.name} <span className="badge badge-ok" style={{ padding: '1px 6px' }}>Editable Source</span></div>
            <div className="t-2xs mut">{editableFile.sizeKB.toLocaleString('vi-VN')} KB · bản mềm</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onEditableFile(null)}>Bỏ chọn</button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: 12, borderStyle: 'dashed' }}
          onClick={() => editRef.current?.click()}
        >
          <Icon name="plus" size={16} /> Thêm bản mềm (.docx/.xlsx — tùy chọn)
        </button>
      )}

      {/* A2: File đính kèm (tùy chọn, nhiều file) */}
      {onAttachments && (
        <div style={{ marginTop: 18 }}>
          <div className="t-sm" style={{ fontWeight: 600, marginBottom: 8 }}>File đính kèm (tùy chọn)</div>
          <input ref={attRef} type="file" multiple accept={ATTACHMENT_ACCEPT} style={{ display: 'none' }} onChange={(e) => { addAttachments(e.target.files); e.target.value = ''; }} />
          {attachments.map((a, i) => (
            <div className="filecard" style={{ marginBottom: 8 }} key={`${a.name}-${i}`}>
              <div className="ficon doc">{(a.ext || 'FILE').toUpperCase().slice(0, 4)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-sm" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>{a.name}</div>
                <div className="t-2xs mut">{a.sizeKB.toLocaleString('vi-VN')} KB · đính kèm</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => removeAttachment(i)}>Bỏ</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost" style={{ borderStyle: 'dashed' }} onClick={() => attRef.current?.click()}>
            <Icon name="plus" size={16} /> Thêm file đính kèm (pdf/doc/xls/ảnh/zip)
          </button>
        </div>
      )}
    </>
  );
}
