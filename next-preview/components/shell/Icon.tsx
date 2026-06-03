import * as React from 'react';

// Bộ icon SVG — port từ dms-design/assets/shell.js, viết lại dạng JSX thuần
// (KHÔNG dùng dangerouslySetInnerHTML). Tất cả dùng stroke currentColor, width 1.8.
export type IconName =
  | 'dashboard' | 'search' | 'docs' | 'upload' | 'replace' | 'admin'
  | 'bell' | 'help' | 'clock' | 'star' | 'archive' | 'reports';

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  docs: (
    <>
      <path d="M14 3v5h5" />
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  replace: (
    <>
      <path d="M3 8h13l-3-3m3 3-3 3" />
      <path d="M21 16H8l3-3m-3 3 3 3" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  star: <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z" />,
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </>
  ),
  reports: <path d="M4 20V10m6 10V4m6 16v-7" />,
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** Icon SVG nội tuyến (JSX). Bỏ size để CSS ngữ cảnh quyết định (.nav-item svg=18, .appbar .iconbtn svg=20…). */
export default function Icon({ name, size, className }: IconProps): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...(size ? { width: size, height: size } : {})}
    >
      {PATHS[name]}
    </svg>
  );
}
