'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useSession, signIn, signOut } from 'next-auth/react';
import { MockDmsService } from '@dms/services/MockDmsService';
import { ApiDmsService } from '@/services/ApiDmsService';

// Render cây UI ở client (ssr:false) — xem ghi chú phiên trước (window/Blob/Fluent).
const DmsPortal = dynamic(() => import('@dms/components/DmsPortal'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 24, fontFamily: 'Segoe UI, sans-serif', color: '#605e5c' }}>
      Đang tải DMS Portal (local preview)…
    </div>
  ),
});

// 'graph' = dùng dữ liệu thật qua Microsoft Graph (read-only). Khác => MockDmsService.
const DATA_SOURCE = process.env.NEXT_PUBLIC_DMS_DATA_SOURCE;

function Centered({ children }: { children: React.ReactNode }): React.ReactElement {
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
          maxWidth: 420,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function SignInCard({ note }: { note?: string }): React.ReactElement {
  return (
    <Centered>
      <h1 style={{ fontSize: 20, margin: '0 0 8px', color: '#242424' }}>Văn bản điều hành — DMS Portal</h1>
      <p style={{ color: '#605e5c', margin: '0 0 20px', fontSize: 14 }}>
        {note ?? 'Đăng nhập bằng tài khoản Microsoft (Bia Hạ Long) để xem dữ liệu DMS Library thật (chế độ chỉ đọc).'}
      </p>
      <button
        onClick={() => signIn('azure-ad')}
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
        Đăng nhập với Microsoft
      </button>
    </Centered>
  );
}

function AuthBar({ name }: { name?: string | null }): React.ReactElement {
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 12,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid #edebe9',
        borderRadius: 16,
        padding: '4px 10px',
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <span style={{ color: '#242424' }}>🟢 {name ?? 'Đã đăng nhập'} · Graph read-only</span>
      <button
        onClick={() => signOut()}
        style={{
          background: 'transparent',
          border: '1px solid #d1d1d1',
          borderRadius: 12,
          padding: '2px 10px',
          cursor: 'pointer',
          fontSize: 12,
          color: '#605e5c',
        }}
      >
        Đăng xuất
      </button>
    </div>
  );
}

function MockPreview(): React.ReactElement {
  const dmsService = React.useMemo(() => new MockDmsService(), []);
  return (
    <main>
      <DmsPortal dmsService={dmsService} userDisplayName="Local User" hasTeamsContext={false} />
    </main>
  );
}

function GraphPreview(): React.ReactElement {
  const { data: session, status } = useSession();
  const dmsService = React.useMemo(() => new ApiDmsService(), []);

  if (status === 'loading') {
    return <Centered>Đang kiểm tra phiên đăng nhập…</Centered>;
  }
  if (status !== 'authenticated') {
    return <SignInCard />;
  }
  if (session?.error === 'RefreshAccessTokenError') {
    return <SignInCard note="Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." />;
  }
  return (
    <main>
      <AuthBar name={session.user?.name} />
      <DmsPortal
        dmsService={dmsService}
        userDisplayName={session.user?.name ?? 'Microsoft User'}
        hasTeamsContext={false}
      />
    </main>
  );
}

export default function PreviewClient(): React.ReactElement {
  return DATA_SOURCE === 'graph' ? <GraphPreview /> : <MockPreview />;
}
