'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { SearchDoc, matchesPick } from './replaceTypes';

// Ô tìm + danh sách gợi ý để chọn 1 văn bản. UI port từ ReplaceDocument.html
// (.picksearch + .suggest/.sg + .pickedcard). Read-only — chỉ chọn từ kho hiện có.
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

  const suggestions = React.useMemo(() => {
    const list = docs.filter((d) => d.id !== excludeId && matchesPick(d, q));
    return list.slice(0, 8);
  }, [docs, q, excludeId]);

  const ficonStyle: React.CSSProperties =
    variant === 'new'
      ? { background: 'var(--navy-050)', color: 'var(--navy-600)' }
      : {};

  return (
    <div>
      <div className="picksearch" style={{ marginBottom: 12 }}>
        <Icon name="search" />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {selected && (
        <div
          className="pickedcard rp-picked"
          style={{
            padding: 12,
            border: `1px solid var(--navy-${variant === 'new' ? '400' : '300'})`,
            borderRadius: 'var(--r-md)',
            background: variant === 'new' ? '#fff' : 'var(--navy-050)',
            marginBottom: 12,
          }}
        >
          <div className="ficon" style={ficonStyle}>{selected.type === 'pdf' ? 'PDF' : 'DOC'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="num">{selected.num}</div>
            <div className="t-sm" style={{ fontWeight: 600, lineHeight: 1.35 }}>{selected.title}</div>
            <div className="row gap-2" style={{ marginTop: 6 }}>
              <span className={`badge ${selected.statusClass}`} style={{ padding: '2px 7px' }}>{selected.statusLabel}</span>
              <span className="t-2xs mut">Ký: {selected.nguoiKy} · {selected.ngayBH}</span>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" title="Bỏ chọn" onClick={() => setQ('')} aria-label="Đổi lựa chọn">
            <Icon name="search" size={16} />
          </button>
        </div>
      )}

      <div className="suggest">
        <div className="t-2xs mut" style={{ padding: '8px 12px 4px', fontWeight: 600 }}>
          {loading ? 'Đang tải văn bản…' : suggestions.length ? 'Gợi ý văn bản' : 'Không có văn bản phù hợp'}
        </div>
        {suggestions.map((s) => {
          const isPicked = selected?.id === s.id;
          return (
            <div
              className="sg"
              key={s.id}
              style={isPicked ? { background: 'var(--navy-050)' } : undefined}
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
              <div
                className="ficon"
                style={{ width: 24, height: 28, borderRadius: 3, background: 'var(--gray-150)', color: 'var(--gray-500)', display: 'grid', placeItems: 'center', fontSize: 7, fontWeight: 800 }}
              >
                {s.type === 'pdf' ? 'PDF' : 'DOC'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="num">{s.num}</div>
                <div className="t-xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
              </div>
              {isPicked && <span className="badge badge-navy" style={{ padding: '2px 7px' }}>Đang chọn</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
