'use client';

import * as React from 'react';
import Link from 'next/link';
import Icon from '@/components/shell/Icon';
import { UploadForm } from './uploadTypes';

export interface PublishResult {
  ok: boolean;
  listItemId?: string;
  webUrl?: string;
  fileName?: string;
  hasEditableSource?: boolean;
  warning?: string;
}

// Bước 4 — success state. result != null → ghi THẬT (sandbox); null → mô phỏng (xem trước).
export default function PublishStep({
  form,
  onReset,
  result,
  replacedNum,
}: {
  form: UploadForm;
  onReset: () => void;
  result?: PublishResult | null;
  replacedNum?: string | null;
}): React.ReactElement {
  const real = !!result?.ok;
  const title = real ? (replacedNum ? 'Đã tải lên và thay thế thành công' : 'Tải lên thành công') : 'Hoàn tất (bản xem trước)';
  return (
    <div className="success">
      <div className="check">
        <Icon name="check" size={36} />
      </div>
      <h2 className="t-h1" style={{ margin: '0 0 6px' }}>{title}</h2>
      <p className="t-body mut" style={{ margin: '0 0 8px' }}>
        Văn bản{' '}
        <b style={{ color: 'var(--navy-600)', fontFamily: 'var(--font-mono)' }}>{form.soVanBan || '(chưa nhập số VB)'}</b>{' '}
        {real ? 'đã được tải lên SharePoint.' : 'đã sẵn sàng.'}
      </p>
      {real && replacedNum && (
        <p className="t-sm" style={{ color: 'var(--navy-600)', margin: '0 0 8px' }}>
          Đã thay thế <b style={{ fontFamily: 'var(--font-mono)' }}>{replacedNum}</b> — văn bản cũ chuyển “Hết hiệu lực”.
        </p>
      )}

      {real ? (
        <>
          {result?.fileName && (
            <p className="t-sm mut" style={{ margin: '0 0 6px' }}>
              Tên file: <span style={{ fontFamily: 'var(--font-mono)' }}>{result.fileName}</span>
            </p>
          )}
          {result?.warning && (
            <p className="t-sm" style={{ color: 'var(--warning-700)', margin: '0 0 8px' }}>{result.warning}</p>
          )}
        </>
      ) : (
        <p className="t-sm" style={{ color: 'var(--warning-700)', margin: '0 0 8px' }}>
          Chế độ xem trước — bạn chưa có quyền ghi (DMS_WRITE).
        </p>
      )}

      <div className="row gap-2" style={{ marginTop: 22, justifyContent: 'center' }}>
        <button className="btn btn-ghost" onClick={onReset}>Tạo mới</button>
        {real && result?.listItemId && (
          <Link className="btn btn-primary" href={`/documents/${encodeURIComponent(result.listItemId)}`}>Mở chi tiết</Link>
        )}
        <Link className="btn btn-subtle" href="/search">Về tìm kiếm</Link>
      </div>
    </div>
  );
}
