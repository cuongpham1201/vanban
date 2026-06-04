'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { IDocument } from '@dms/models/IDocument';
import { ReplaceStep, STEPS, SearchDoc, toSearchDoc } from './replaceTypes';
import DocumentPicker from './DocumentPicker';
import CompareStep from './CompareStep';
import ConfirmStep from './ConfirmStep';

interface DocsResponse {
  ok: boolean;
  documents?: IDocument[];
  error?: string;
}

// Orchestrator Thay thế văn bản (UI only, read-only). Flow 4 bước:
//   1) Chọn văn bản cũ · 2) Chọn văn bản mới (≠ cũ) · 3) So sánh · 4) Xác nhận.
// Đọc dữ liệu thật qua GET /api/documents. KHÔNG ghi SharePoint, không API mới.
export default function ReplacePage(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oldParam = searchParams.get('old');
  const [docs, setDocs] = React.useState<SearchDoc[] | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const [step, setStep] = React.useState<ReplaceStep>(1);
  const [oldDoc, setOldDoc] = React.useState<SearchDoc | null>(null);
  const [newDoc, setNewDoc] = React.useState<SearchDoc | null>(null);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/documents', { credentials: 'same-origin' })
      .then(async (r) => {
        const j = (await r.json()) as DocsResponse;
        if (!r.ok || !j.ok) {
          throw new Error(j?.error ?? `Lỗi tải dữ liệu (HTTP ${r.status}).`);
        }
        if (alive) {
          const mapped = (j.documents ?? []).map(toSearchDoc);
          setDocs(mapped);
          // Nếu đến từ Document Detail (?old=<id>) → tự chọn sẵn văn bản cũ ở bước 1.
          if (oldParam) {
            const preset = mapped.find((d) => d.id === oldParam);
            if (preset) {
              setOldDoc(preset);
            }
          }
        }
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [oldParam]);

  const loading = docs === null;
  const list = docs ?? [];

  // Chọn văn bản cũ: nếu trùng văn bản mới đang chọn thì bỏ chọn bản mới (không cho trùng).
  const pickOld = (d: SearchDoc): void => {
    setOldDoc(d);
    if (newDoc && newDoc.id === d.id) {
      setNewDoc(null);
    }
  };
  const pickNew = (d: SearchDoc): void => {
    if (oldDoc && d.id === oldDoc.id) {
      return; // chặn chọn trùng văn bản cũ
    }
    setNewDoc(d);
  };

  const reset = (): void => {
    setStep(1);
    setOldDoc(null);
    setNewDoc(null);
    setDone(false);
  };

  const canNext =
    (step === 1 && !!oldDoc) ||
    (step === 2 && !!newDoc && newDoc.id !== oldDoc?.id) ||
    step === 3;

  const go = (next: ReplaceStep): void => setStep(next);

  if (error) {
    return (
      <div className="rp-root">
        <div className="wrap">
          <div className="rp-empty" style={{ color: 'var(--danger-700)' }}>Không tải được dữ liệu: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rp-root">
      <div className="wrap">
        <h1 className="t-h1" style={{ margin: '0 0 4px' }}>Thay thế văn bản</h1>
        <p className="t-sm mut" style={{ margin: '0 0 24px' }}>
          Liên kết văn bản mới với văn bản cũ. Đây là bản xem trước giao diện — quan hệ thay thế chưa ghi xuống SharePoint.
        </p>

        {/* Stepper */}
        <div className="rp-stepper">
          {STEPS.map((s, i) => {
            const state = step === s.step ? 'on' : step > s.step ? 'done' : '';
            return (
              <React.Fragment key={s.step}>
                <div className={`rp-step ${state}`}>
                  <span className="rp-step-no">{step > s.step ? '✓' : s.step}</span>
                  <span className="rp-step-lb">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <span className="rp-step-line" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Body theo bước */}
        <div className="rp-body">
          {step === 1 && (
            <div className="docbox old">
              <div className="head">① Văn bản bị thay thế (cũ)</div>
              <div className="body">
                <DocumentPicker
                  variant="old"
                  placeholder="Tìm văn bản cần thay thế…"
                  docs={list}
                  loading={loading}
                  selected={oldDoc}
                  onPick={pickOld}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="docbox new">
              <div className="head">② Văn bản thay thế (mới)</div>
              <div className="body">
                <p className="t-xs mut" style={{ margin: '0 0 10px' }}>
                  Chọn một văn bản khác trong kho để thay thế <b>{oldDoc?.num}</b>. Không thể chọn trùng văn bản cũ.
                </p>
                <DocumentPicker
                  variant="new"
                  placeholder="Tìm văn bản thay thế…"
                  docs={list}
                  loading={loading}
                  selected={newDoc}
                  excludeId={oldDoc?.id ?? null}
                  onPick={pickNew}
                />
              </div>
            </div>
          )}

          {step === 3 && oldDoc && newDoc && <CompareStep oldDoc={oldDoc} newDoc={newDoc} />}

          {step === 4 && oldDoc && newDoc && <ConfirmStep oldDoc={oldDoc} newDoc={newDoc} done={done} />}
        </div>

        {/* Footer điều hướng */}
        <div className="rp-foot">
          {step === 1 ? (
            <button type="button" className="btn btn-ghost" onClick={() => router.push('/dashboard')}>Huỷ</button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => go((step - 1) as ReplaceStep)} disabled={done}>
              ← Quay lại
            </button>
          )}

          <div className="row gap-2">
            {step === 4 && (
              <button type="button" className="btn btn-subtle" onClick={reset}>Bắt đầu lại</button>
            )}
            {step < 4 && (
              <button type="button" className="btn btn-primary" onClick={() => go((step + 1) as ReplaceStep)} disabled={!canNext}>
                Tiếp tục →
              </button>
            )}
            {step === 4 && !done && (
              <button type="button" className="btn btn-gold" onClick={() => setDone(true)}>Hoàn tất (UI only)</button>
            )}
            {step === 4 && done && (
              <button type="button" className="btn btn-primary" onClick={reset}>Tạo lượt thay thế khác</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
