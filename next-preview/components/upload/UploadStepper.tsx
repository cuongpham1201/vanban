'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';

const STEPS = ['Tải file', 'Metadata', 'Kiểm tra', 'Xuất bản'];

// Stepper 4 bước — port từ UploadWizard.html .stepper.
export default function UploadStepper({ current }: { current: number }): React.ReactElement {
  return (
    <div className="stepper">
      {STEPS.map((s, i) => {
        const cls = i < current ? 'done' : i === current ? 'on' : '';
        return (
          <React.Fragment key={s}>
            <div className={`step ${cls}`}>
              <span className="dot">{i < current ? <Icon name="check" /> : i + 1}</span>
              <span className="lbl">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`stepline ${i < current ? 'done' : ''}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
