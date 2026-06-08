'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { SearchDoc } from './replaceTypes';

// Bước xác nhận (UI preview). Port .link-preview + .opt từ ReplaceDocument.html.
// Các tuỳ chọn hiển thị ở dạng xem trước (disabled) — KHÔNG ghi SharePoint.
export default function ConfirmStep({
  oldDoc,
  newDoc,
  done,
  real = false,
  canWrite = false,
}: {
  oldDoc: SearchDoc;
  newDoc: SearchDoc;
  done: boolean;
  real?: boolean;
  canWrite?: boolean;
}): React.ReactElement {
  if (done) {
    return (
      <div className="rp-success">
        <div className="rp-success-ic"><Icon name="check" size={30} /></div>
        <div className="t-h3" style={{ margin: '12px 0 6px' }}>{real ? 'Đã ghi thay thế thành công' : 'Đã hoàn tất (bản xem trước)'}</div>
        <div className="t-sm mut" style={{ maxWidth: 460 }}>
          {real ? (
            <>Đã ghi xuống SharePoint: <b>{newDoc.num}</b> thay thế <b>{oldDoc.num}</b>; văn bản cũ chuyển <b>“Hết hiệu lực”</b>.</>
          ) : (
            <>Quan hệ thay thế <b>{newDoc.num}</b> → <b>{oldDoc.num}</b> đã dựng trên giao diện. Chưa ghi xuống SharePoint (cần quyền ghi).</>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="link-preview">
        <div className="t-eyebrow" style={{ color: 'var(--gold-700)', marginBottom: 8 }}>Quan hệ sẽ được tạo</div>
        <div className="linkrow">
          <span className="tagk rp-tag-new">{newDoc.num}</span>
          <span className="mut">thay thế →</span>
          <span className="tagk rp-tag-old">{oldDoc.num}</span>
        </div>
        <div className="linkrow">
          <span className="tagk rp-tag-old">{oldDoc.num}</span>
          <span className="mut">bị thay thế bởi →</span>
          <span className="tagk rp-tag-new">{newDoc.num}</span>
        </div>

        <div style={{ marginTop: 8 }}>
          <label className="opt">
            <input type="checkbox" defaultChecked disabled />
            <div>
              <div className="t-sm" style={{ fontWeight: 600 }}>Chuyển văn bản cũ sang trạng thái “Hết hiệu lực”</div>
              <div className="t-xs mut">Vẫn lưu trữ và tìm được, nhưng đánh dấu rõ đã hết hiệu lực kể từ ngày thay thế.</div>
            </div>
          </label>
          <label className="opt">
            <input type="checkbox" defaultChecked disabled />
            <div>
              <div className="t-sm" style={{ fontWeight: 600 }}>Kế thừa metadata, tags và văn bản liên quan từ bản cũ</div>
              <div className="t-xs mut">Tiết kiệm thời gian nhập liệu — có thể chỉnh sửa lại sau.</div>
            </div>
          </label>
        </div>
      </div>

      {/* Metadata liên quan */}
      <div className="rp-meta">
        <div className="t-eyebrow" style={{ marginBottom: 10 }}>Metadata liên quan</div>
        <div className="rp-meta-grid">
          <div><span className="rp-cmp-k">Trích yếu (mới)</span><span className="rp-cmp-v">{newDoc.title}</span></div>
          <div><span className="rp-cmp-k">Đơn vị (mới)</span><span className="rp-cmp-v">{newDoc.donViPH}</span></div>
          <div><span className="rp-cmp-k">Nhóm tài liệu</span><span className="rp-cmp-v">{newDoc.nhom}</span></div>
          <div><span className="rp-cmp-k">Tags kế thừa</span><span className="rp-cmp-v">{oldDoc.tags.length ? oldDoc.tags.map((t) => `#${t}`).join(' ') : '—'}</span></div>
        </div>
      </div>

      {/* Cảnh báo: ghi thật vs xem trước */}
      <div className="rp-warn">
        <Icon name="help" size={18} />
        <div>
          {canWrite ? (
            <><b>Sẽ ghi xuống SharePoint.</b> Bản mới nhận <code>VanBanThayThe</code>, bản cũ chuyển “Hết hiệu lực” + ngày hết hiệu lực. (Reverse-link chưa ghi — cần field V3.)</>
          ) : (
            <><b>Đây là UI preview.</b> Bạn không có quyền ghi (DMS_WRITE) — quan hệ thay thế chưa ghi xuống SharePoint.</>
          )}
        </div>
      </div>
    </div>
  );
}
