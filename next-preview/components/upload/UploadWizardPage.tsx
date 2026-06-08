'use client';

import * as React from 'react';
import UploadStepper from './UploadStepper';
import FileDropzone from './FileDropzone';
import MetadataForm from './MetadataForm';
import ReviewStep from './ReviewStep';
import PublishStep, { PublishResult } from './PublishStep';
import ReplaceTargetPicker from './ReplaceTargetPicker';
import { EMPTY_FORM, UploadForm, SelectedFile } from './uploadTypes';
import { SearchDoc } from '@/components/replace/replaceTypes';

const EXPIRED_LABEL = 'Hết hiệu lực';

// Orchestrator Upload Wizard.
//  - Mặc định (write tắt / không allowlist): GIỮ NGUYÊN chế độ xem trước (mô phỏng).
//  - Khi DMS_WRITE_ENABLED + allowlist (GET /api/dms/write-status → canWrite): "Xuất bản" GỌI THẬT
//    POST /api/documents/upload (multipart) với idempotencyKey.
export default function UploadWizardPage(): React.ReactElement {
  const [step, setStep] = React.useState(0);
  const [file, setFile] = React.useState<SelectedFile | null>(null);
  const [editableFile, setEditableFile] = React.useState<SelectedFile | null>(null); // BUG#18 bản mềm
  const [form, setForm] = React.useState<UploadForm>(EMPTY_FORM);

  const [canWrite, setCanWrite] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [dupMatches, setDupMatches] = React.useState<{ id: string; soVanBan: string; trichYeu: string }[] | null>(null);
  const [result, setResult] = React.useState<PublishResult | null>(null);
  const [idemKey, setIdemKey] = React.useState<string>('');
  const [dynChoices, setDynChoices] = React.useState<Partial<Record<keyof UploadForm, string[]>> | undefined>();
  // #35 — Văn bản thay thế chọn ngay trong wizard.
  const [replaceTarget, setReplaceTarget] = React.useState<SearchDoc | null>(null);
  const [replacedNum, setReplacedNum] = React.useState<string | null>(null);
  // Chỉ replace khi đã chọn + KHÔNG phải văn bản đã Hết hiệu lực (Phase 6).
  const replaceEligible = !!replaceTarget && replaceTarget.statusLabel !== EXPIRED_LABEL;

  React.useEffect(() => {
    setIdemKey(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    let alive = true;
    fetch('/api/dms/write-status', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const cw = !!j?.canWrite;
        setCanWrite(cw);
        if (!cw) return;
        // Nạp choices ĐỘNG từ schema thật (folder cấp lưu trữ + choice cột).
        fetch('/api/dms/metadata-choices', { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((c) => {
            if (!alive || !c?.ok) return;
            const ch = c.choices ?? {};
            setDynChoices({
              loaiVanBanPhapLy: ch.loaiVanBanPhapLy, loaiTaiLieu: ch.loaiTaiLieu, nhomTaiLieu: ch.nhomTaiLieu,
              trangThai: ch.trangThai, mucDoBaoMat: ch.mucDoBaoMat, nguonMetadata: ch.nguonMetadata,
              metadataConfidence: ch.metadataConfidence, donViPhatHanh: ch.donViPhatHanh, donViSoHuu: ch.donViSoHuu,
              capLuuTru: c.folders,
            });
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const onChange = (k: keyof UploadForm, v: string): void => setForm((p) => ({ ...p, [k]: v }));
  const go = (n: number): void => setStep(Math.max(0, Math.min(3, n)));
  const reset = (): void => {
    setForm(EMPTY_FORM);
    setFile(null);
    setEditableFile(null);
    setStep(0);
    setPublishError(null);
    setDupMatches(null);
    setResult(null);
    setReplaceTarget(null);
    setReplacedNum(null);
    setIdemKey(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  };

  // Gửi upload thật. override=true → bỏ qua cảnh báo trùng SoVanBan.
  const doPublish = async (override: boolean): Promise<void> => {
    if (!file?.raw) {
      setPublishError('Thiếu file. Vui lòng chọn lại ở bước 1.');
      return;
    }
    setPublishing(true);
    setPublishError(null);
    setDupMatches(null);
    try {
      const fd = new FormData();
      fd.append('pdf', file.raw);
      if (editableFile?.raw) {
        fd.append('editable', editableFile.raw); // BUG#18: bản mềm DOCX/XLSX (route đã hỗ trợ)
      }
      fd.append('metadata', JSON.stringify(form));
      fd.append('capLuuTru', form.capLuuTru); // folder lưu file (tách khỏi DonViSoHuu metadata)
      fd.append('idempotencyKey', idemKey);
      if (override) {
        fd.append('override', 'true');
      }
      const res = await fetch('/api/documents/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
      const j = await res.json();
      if (res.status === 201 && j.ok) {
        // #35 — Nếu đã chọn văn bản thay thế (và không Hết hiệu lực): gọi Replace với newDocumentId.
        if (replaceEligible && replaceTarget && j.listItemId && /^\d+$/.test(String(j.listItemId))) {
          try {
            const rep = await fetch('/api/documents/replace', {
              method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldId: replaceTarget.id, newId: j.listItemId, markOldExpired: true, inheritMetadata: false }),
            });
            const rj = await rep.json();
            if (rep.ok && rj.ok) {
              setReplacedNum(replaceTarget.num);
            } else {
              setResult({ ...(j as PublishResult), warning: `Đã tải lên nhưng ghi thay thế thất bại: ${rj?.error ?? `HTTP ${rep.status}`}.` });
              go(3);
              return;
            }
          } catch (e) {
            setResult({ ...(j as PublishResult), warning: `Đã tải lên nhưng lỗi mạng khi ghi thay thế: ${e instanceof Error ? e.message : String(e)}.` });
            go(3);
            return;
          }
        }
        setResult(j as PublishResult);
        go(3);
        return;
      }
      if (res.status === 409 && j.error === 'duplicate') {
        setDupMatches(j.matches ?? []);
        setPublishError(
          replaceEligible
            ? 'Văn bản này đang thay thế một văn bản hiện hữu. Bạn vẫn có thể tiếp tục xuất bản.'
            : 'Số văn bản đã tồn tại. Bạn vẫn có thể tạo bản mới hoặc chuyển sang thay thế.'
        );
        return;
      }
      setPublishError(j?.error ?? `Lỗi (HTTP ${res.status}).`);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Lỗi mạng khi tải lên.');
    } finally {
      setPublishing(false);
    }
  };

  // Bấm nút chính ở bước 2 (Xuất bản): write thật nếu canWrite, ngược lại mô phỏng.
  const onPrimary = (): void => {
    if (step < 2) {
      go(step + 1);
      return;
    }
    if (canWrite) {
      void doPublish(false);
    } else {
      go(3); // mô phỏng (giữ behavior hiện tại)
    }
  };

  return (
    <div className="uw-root">
      <div className="uw-wrap">
        <h1 className="t-h1" style={{ margin: '0 0 4px' }}>Tải lên văn bản mới</h1>
        <p className="t-sm mut" style={{ margin: '0 0 28px' }}>
          {canWrite
            ? 'Chọn file, nhập metadata; có thể chọn “Văn bản thay thế” để vừa tải lên vừa thay thế. “Xuất bản” sẽ tải file lên SharePoint.'
            : 'Bản xem trước UI — bạn chưa có quyền ghi (DMS_WRITE). Chọn file, nhập & kiểm tra metadata.'}
        </p>

        <UploadStepper current={step} />

        <div className="card card-pad">
          {step === 0 && (
            <div className="panel">
              <FileDropzone file={file} onFile={setFile} editableFile={editableFile} onEditableFile={setEditableFile} />
            </div>
          )}
          {step === 1 && (
            <div className="panel">
              <MetadataForm form={form} onChange={onChange} dynamicChoices={dynChoices} />
              <ReplaceTargetPicker target={replaceTarget} onChange={setReplaceTarget} />
            </div>
          )}
          {step === 2 && (
            <div className="panel">
              <ReviewStep form={form} file={file} replaceTarget={replaceEligible ? replaceTarget : null} />
              {publishError && (
                <div className="uw-publish-error" style={{ marginTop: 14, padding: '10px 14px', background: 'var(--danger-100)', color: 'var(--danger-700)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)' }}>
                  {publishError}
                  {dupMatches && dupMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 600 }}>Văn bản đang tồn tại:</div>
                      {dupMatches.map((m) => (
                        <div key={m.id} className="t-xs">• {m.soVanBan} — {m.trichYeu}</div>
                      ))}
                      <div className="row gap-2" style={{ marginTop: 8 }}>
                        <button className="btn btn-subtle" onClick={() => void doPublish(true)} disabled={publishing}>Vẫn tạo mới</button>
                        {/* Phase 4: nếu đã chọn văn bản thay thế inline thì KHÔNG ép sang màn hình Replace. */}
                        {!replaceEligible && dupMatches[0] && (
                          <a className="btn btn-ghost" href={`/replace?old=${encodeURIComponent(dupMatches[0].id)}`}>Chuyển sang Thay thế</a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="panel">
              <PublishStep form={form} onReset={reset} result={result} replacedNum={replacedNum} />
            </div>
          )}

          {step < 3 && (
            <div className="navbtns">
              <button className="btn btn-ghost" style={{ visibility: step === 0 ? 'hidden' : 'visible' }} onClick={() => go(step - 1)} disabled={publishing}>
                ← Quay lại
              </button>
              <button className={`btn ${step === 2 ? 'btn-gold' : 'btn-primary'}`} onClick={onPrimary} disabled={publishing}>
                {step === 2 ? (publishing ? 'Đang tải lên…' : canWrite ? 'Xuất bản văn bản' : 'Xuất bản (xem trước)') : 'Tiếp tục →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
