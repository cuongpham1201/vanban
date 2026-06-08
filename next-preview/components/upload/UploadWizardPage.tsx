'use client';

import * as React from 'react';
import UploadStepper from './UploadStepper';
import FileDropzone from './FileDropzone';
import MetadataForm from './MetadataForm';
import ReviewStep from './ReviewStep';
import PublishStep, { PublishResult } from './PublishStep';
import { EMPTY_FORM, UploadForm, SelectedFile } from './uploadTypes';

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
        setResult(j as PublishResult);
        go(3);
        return;
      }
      if (res.status === 409 && j.error === 'duplicate') {
        setDupMatches(j.matches ?? []);
        setPublishError('Số văn bản đã tồn tại. Bạn vẫn có thể tạo bản mới hoặc chuyển sang thay thế.');
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
            ? 'Chế độ ghi thật đang bật (sandbox/allowlist). “Xuất bản” sẽ tải file lên SharePoint.'
            : 'Bản xem trước UI — chọn file, nhập & kiểm tra metadata. Chưa ghi SharePoint.'}
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
            </div>
          )}
          {step === 2 && (
            <div className="panel">
              <ReviewStep form={form} file={file} />
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
                        {dupMatches[0] && (
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
              <PublishStep form={form} onReset={reset} result={result} />
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
