'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { SearchDoc, matchesPick } from './replaceTypes';
import styles from './DocumentPicker.module.css';

// Ô tìm + danh sách gợi ý để chọn 1 văn bản. UI port từ ReplaceDocument.html
// (.picksearch + .suggest/.sg + .pickedcard) — nhưng style tự chứa qua CSS Module để hoạt động
// trên MỌI route (/replace và Upload Wizard /upload), không phụ thuộc .rp-root / replace.css.
// Read-only — chỉ chọn từ kho hiện có.
export default function DocumentPicker({
  variant,
  placeholder,
  docs,
  loading,
  selected,
  excludeId,
  onPick,
}: {
  variant: 'old' | 'new';
  placeholder: string;
  docs: SearchDoc[];
  loading: boolean;
  selected: SearchDoc | null;
  excludeId?: string | null;
  onPick: (doc: SearchDoc) => void;
}): React.ReactElement {
  const [q, setQ] = React.useState('');
  const hasQuery = q.trim().length > 0;

  const suggestions = React.useMemo(() => {
    if (!hasQuery) {
      return [] as SearchDoc[];
    }
    const list = docs.filter((d) => d.id !== excludeId && matchesPick(d, q));
    return list.slice(0, 8);
  }, [docs, q, excludeId, hasQuery]);

  return (
    <div>
      <div className={styles.picksearch}>
        <Icon name="search" size={18} />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {selected && (
        <div className={`${styles.pickedcard} ${variant === 'new' ? styles.pickedcardNew : styles.pickedcardOld}`} style={{ marginTop: 12 }}>
          <div className={`${styles.ficon} ${variant === 'new' ? styles.ficonNew : ''}`}>
            {selected.type === 'pdf' ? 'PDF' : 'DOC'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.num}>{selected.num}</div>
            <div className="t-sm" style={{ fontWeight: 600, lineHeight: 1.35 }}>{selected.title}</div>
            <div className="row gap-2" style={{ marginTop: 6 }}>
              <span className={`badge ${selected.statusClass}`} style={{ padding: '2px 7px' }}>{selected.statusLabel}</span>
              <span className="t-2xs mut">Ký: {selected.nguoiKy} · {selected.ngayBH}</span>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" title="Đổi lựa chọn" onClick={() => setQ('')} aria-label="Đổi lựa chọn">
            <Icon name="search" size={16} />
          </button>
        </div>
      )}

      <div className={styles.suggest}>
        {loading ? (
          <div className={styles.hint}>Đang tải văn bản…</div>
        ) : !hasQuery ? (
          <div className={styles.emptyHint}>Nhập số văn bản hoặc từ khóa để tìm văn bản cần chọn.</div>
        ) : suggestions.length === 0 ? (
          <div className={styles.emptyHint}>Không có văn bản phù hợp với “{q.trim()}”.</div>
        ) : (
          <>
            <div className={styles.hint}>Gợi ý văn bản</div>
            <div className={styles.suggestScroll}>
              {suggestions.map((s) => {
                const isPicked = selected?.id === s.id;
                return (
                  <div
                    className={`${styles.sg} ${isPicked ? styles.sgPicked : ''}`}
                    key={s.id}
                    onClick={() => onPick(s)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPick(s);
                      }
                    }}
                  >
                    <div className={styles.sgFicon}>{s.type === 'pdf' ? 'PDF' : 'DOC'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={`${styles.num} ${styles.numSm}`}>{s.num}</div>
                      <div className={`t-xs ${styles.title}`}>{s.title}</div>
                    </div>
                    {isPicked && <span className="badge badge-navy" style={{ padding: '2px 7px' }}>Đang chọn</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
