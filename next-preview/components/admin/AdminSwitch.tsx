'use client';

import * as React from 'react';

// Toggle pill — port từ switch inline trong Admin.html (34×18, navy khi bật).
export default function AdminSwitch({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`adm-switch${on ? ' on' : ''}`}
      onClick={() => !disabled && onChange(!on)}
    >
      <i />
    </button>
  );
}
