'use client';

import * as React from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

// Map mã lỗi NextAuth → thông điệp tiếng Việt thân thiện.
function errorMessage(code: string | null): string | undefined {
  if (!code) {
    return undefined;
  }
  switch (code) {
    case 'OAuthSignin':
    case 'OAuthCallback':
    case 'Callback':
    case 'Configuration':
      return 'Không kết nối được dịch vụ đăng nhập Microsoft. Vui lòng thử lại hoặc liên hệ quản trị viên.';
    case 'AccessDenied':
      return 'Tài khoản của bạn không có quyền truy cập hệ thống.';
    case 'Verification':
      return 'Liên kết đăng nhập đã hết hạn. Vui lòng thử lại.';
    default:
      return `Đăng nhập chưa thành công (mã: ${code}). Vui lòng thử lại.`;
  }
}

export default function SignInClient(): React.ReactElement {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') || '/';
  const errMsg = errorMessage(params.get('error'));

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Segoe UI, sans-serif',
        background: '#f5f5f5',
      }}
    >
      <div
        style={{
          background: '#fff',
          padding: '32px 40px',
          borderRadius: 8,
          boxShadow: '0 1.6px 3.6px rgba(0,0,0,0.08), 0 0.3px 0.9px rgba(0,0,0,0.06)',
          textAlign: 'center',
          maxWidth: 440,
        }}
      >
        <h1 style={{ fontSize: 20, margin: '0 0 8px', color: '#242424' }}>Văn bản điều hành — DMS Portal</h1>
        <p style={{ color: '#605e5c', margin: '0 0 20px', fontSize: 14, lineHeight: 1.5 }}>
          Đăng nhập bằng tài khoản Microsoft 365 Bia Hạ Long để xem dữ liệu DMS Library thật.
        </p>
        {errMsg && (
          <div
            style={{
              background: '#fde7e9',
              color: '#a4262c',
              border: '1px solid #f3c2c6',
              borderRadius: 4,
              padding: '8px 12px',
              fontSize: 13,
              margin: '0 0 16px',
            }}
          >
            {errMsg}
          </div>
        )}
        <button
          onClick={() => signIn('azure-ad', { callbackUrl })}
          style={{
            background: '#0038a8',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '10px 20px',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Đăng nhập với Microsoft 365
        </button>
      </div>
    </div>
  );
}
