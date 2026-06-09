import * as React from 'react';
import Link from 'next/link';

// Màn hình "Không có quyền truy cập" — dùng cho route ghi (/upload, /replace) khi user không có DMS write.
export default function AccessDenied({
  message = 'Bạn không có quyền tải lên hoặc thay thế văn bản.',
}: {
  message?: string;
}): React.ReactElement {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 40,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--danger-100)',
          color: 'var(--danger-700)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 26,
          fontWeight: 800,
        }}
        aria-hidden
      >
        !
      </div>
      <h1 style={{ fontSize: 'var(--fs-h2)', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
        Không có quyền truy cập
      </h1>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--gray-600)', maxWidth: 420, margin: 0, lineHeight: 1.5 }}>
        {message}
      </p>
      <Link href="/search" className="btn btn-primary" style={{ marginTop: 8 }}>
        Quay lại trang tìm kiếm
      </Link>
    </div>
  );
}
