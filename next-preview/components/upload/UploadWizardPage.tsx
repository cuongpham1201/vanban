'use client';

import * as React from 'react';
import UploadStepper from './UploadStepper';
import FileDropzone from './FileDropzone';
import MetadataForm from './MetadataForm';
import ReviewStep from './ReviewStep';
import PublishStep from './PublishStep';
import { EMPTY_FORM, UploadForm, SelectedFile } from './uploadTypes';

// Orchestrator Upload Wizard (UI only). KHÔNG fetch / KHÔNG ghi SharePoint.
export default function UploadWizardPage(): React.ReactElement {
  const [step, setStep] = React.useState(0);
  const [file, setFile] = React.useState<SelectedFile | null>(null);
  const [attachSource, setAttachSource] = React.useState(true);
  const [form, setForm] = React.useState<UploadForm>(EMPTY_FORM);

  const onChange = (k: keyof UploadForm, v: string): void => setForm((p) => ({ ...p, [k]: v }));
  const go = (n: number): void => setStep(Math.max(0, Math.min(3, n)));
  const reset = (): void => {
    setForm(EMPTY_FORM);
    setFile(null);
    setAttachSource(true);
    setStep(0);
  };

  return (
    <div className="uw-root">
      <div className="uw-wrap">
        <h1 className="t-h1" style={{ margin: '0 0 4px' }}>Tải lên văn bản mới</h1>
        <p className="t-sm mut" style={{ margin: '0 0 28px' }}>
          Bản xem trước UI — chọn file, nhập &amp; kiểm tra metadata. Chưa ghi SharePoint (Publish thật ở Phase 5).
        </p>

        <UploadStepper current={step} />

        <div className="card card-pad">
          {step === 0 && (
            <div className="panel">
              <FileDropzone
                file={file}
                onFile={setFile}
                attachSource={attachSource}
                onAttachToggle={() => setAttachSource((v) => !v)}
              />
            </div>
          )}
          {step === 1 && (
            <div className="panel">
              <MetadataForm form={form} onChange={onChange} />
            </div>
          )}
          {step === 2 && (
            <div className="panel">
              <ReviewStep form={form} file={file} />
            </div>
          )}
          {step === 3 && (
            <div className="panel">
              <PublishStep form={form} onReset={reset} />
            </div>
          )}

          {step < 3 && (
            <div className="navbtns">
              <button
                className="btn btn-ghost"
                style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
                onClick={() => go(step - 1)}
              >
                ← Quay lại
              </button>
              <button className={`btn ${step === 2 ? 'btn-gold' : 'btn-primary'}`} onClick={() => go(step + 1)}>
                {step === 2 ? 'Xuất bản văn bản' : 'Tiếp tục →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
