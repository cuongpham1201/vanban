'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { DetailDoc } from './documentDetailTypes';

// Đính kèm — dữ liệu thật hiện có: bản mềm (editableSource). Không có → fallback an toàn.
export default function AttachmentsPanel({ doc }: { doc: DetailDoc }): React.ReactElement {
  const hasSoft = doc.editable && !!doc.editableSourceUrl;
  if (!hasSoft) {
    return <div className="dd-empty">Chưa có tệp đính kèm / bản mềm cho văn bản này.</div>;
  }
  const ext = (doc.editableSourceName.split('.').pop() ?? 'doc').toUpperCase().slice(0, 4);
  return (
    <a className="attrow" href={doc.editableSourceUrl} target="_blank" rel="noreferrer">
      <div className="ficon">{ext}</div>
      <div style={{ flex: 1 }}>
        <div className="t-sm" style={{ fontWeight: 600 }}>{doc.editableSourceName || 'Bản mềm chỉnh sửa'}</div>
        <div className="t-2xs mut">File nguồn chỉnh sửa (EditableSourceUrl)</div>
      </div>
      <Icon name="download" />
    </a>
  );
}
