'use client';

import * as React from 'react';
import { signOut } from 'next-auth/react';

// Trang hiển thị khi tài khoản KHÔNG thuộc công ty (@biahalong.com) cố đăng nhập.
export default function UnauthorizedPage(): React.ReactElement {
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
        <h1 style={{ fontSize: 20, margin: '0 0 8px', color: '#a4262c' }}>Không có quyền truy cập</h1>
        <p style={{ color: '#605e5c', margin: '0 0 20px', fontSize: 14, lineHeight: 1.5 }}>
          Hệ thống Quản lý văn bản chỉ dành cho tài khoản Microsoft 365 của Công ty CP Bia và Nước giải khát Hạ Long
          (<strong>@biahalong.com</strong>). Vui lòng đăng nhập bằng tài khoản công ty.
        </p>
        <button
          onClick={() => signOut({ callbackUrl: '/signin' })}
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
          Đăng nhập tài khoản khác
        </button>
      </div>
    </div>
  );
}
