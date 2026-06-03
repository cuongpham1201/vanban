'use client';

import * as React from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { LOGO_BIA_HALONG } from '@dms/assets/logoBiaHaLong';

// Map mã lỗi NextAuth → thông điệp tiếng Việt thân thiện.
function errorMessage(code: string | null): string | undefined {
  if (!code) return undefined;
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

function MicrosoftLogo(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden>
      <rect x="1" y="1" width="9.5" height="9.5" fill="#f25022" />
      <rect x="11.5" y="1" width="9.5" height="9.5" fill="#7fba00" />
      <rect x="1" y="11.5" width="9.5" height="9.5" fill="#00a4ef" />
      <rect x="11.5" y="11.5" width="9.5" height="9.5" fill="#ffb900" />
    </svg>
  );
}

const FEATURES = ['Tra cứu', 'Quản lý', 'Chuẩn hóa', 'Lưu trữ'];

export default function SignInClient(): React.ReactElement {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') || '/';
  const errMsg = errorMessage(params.get('error'));
  const [submitting, setSubmitting] = React.useState(false);

  const onSignIn = (): void => {
    setSubmitting(true);
    void signIn('azure-ad', { callbackUrl });
  };

  return (
    <>
      <style>{`
        .vb-login { min-height: 100dvh; display: grid; grid-template-columns: 1.05fr 1fr;
          font-family: 'Segoe UI','Segoe UI Web (West European)',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',sans-serif; }
        .vb-brand { position: relative; overflow: hidden; color: #fff;
          background: linear-gradient(155deg,#0038a8 0%,#002356 100%);
          display: flex; flex-direction: column; justify-content: space-between; padding: 48px 56px; }
        .vb-login-panel { position: relative; background: #fff; display: flex; align-items: center;
          justify-content: center; padding: 40px; }
        .vb-card { width: 100%; max-width: 420px; }
        .vb-sso-btn { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 18px;
          font-size: 15px; font-weight: 600; background: #0038a8; color: #fff; border: none;
          border-radius: 10px; cursor: pointer; transition: background .15s, box-shadow .15s, transform .05s;
          box-shadow: 0 10px 24px -12px rgba(0,56,168,.5); font-family: inherit; }
        .vb-sso-btn:hover { background: #002a7a; box-shadow: 0 12px 28px -10px rgba(0,56,168,.6); }
        .vb-sso-btn:active { transform: translateY(1px); }
        .vb-sso-btn:disabled { opacity: .7; cursor: progress; }
        .vb-sso-ms { background: #fff; border-radius: 4px; padding: 3px; display: inline-flex; }
        @media (max-width: 900px) {
          .vb-login { grid-template-columns: 1fr; }
          .vb-brand { padding: 28px 24px; min-height: auto; }
          .vb-brand-features, .vb-brand-foot { display: none; }
          .vb-brand-hero { margin: 18px 0; }
        }
      `}</style>

      <div className="vb-login">
        {/* ── Left: brand panel ── */}
        <aside className="vb-brand">
          {/* ornament: ngôi sao mờ + ánh sáng góc */}
          <div aria-hidden style={{ position: 'absolute', right: -140, top: -120, width: 560, height: 560,
            background: 'radial-gradient(closest-side, rgba(255,255,255,.10), transparent)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'inline-block', background: 'rgba(255,255,255,.96)', borderRadius: 12, padding: '10px 16px' }}>
              {/* logo công ty (base64 sẵn có trong repo) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_BIA_HALONG} alt="Bia Hạ Long" style={{ height: 40, width: 'auto', display: 'block' }} />
            </div>
          </div>

          <div className="vb-brand-hero" style={{ position: 'relative', zIndex: 2, maxWidth: 520 }}>
            <div style={{ fontSize: 11.5, letterSpacing: '.2em', textTransform: 'uppercase', fontWeight: 700,
              color: 'rgba(255,255,255,.85)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 34, height: 2, background: '#ffd166', display: 'inline-block' }} />
              Văn bản điều hành
            </div>
            <h1 style={{ fontSize: 'clamp(28px,3.4vw,44px)', lineHeight: 1.12, fontWeight: 700, margin: '0 0 16px',
              letterSpacing: '-.01em' }}>
              Hệ thống quản lý<br />văn bản điều hành
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,.85)', maxWidth: 440, margin: 0 }}>
              Cổng tra cứu & quản lý văn bản điều hành tập trung của Bia Hạ Long — chính xác, nhanh chóng, lưu trữ chuẩn hóa.
            </p>
            <div className="vb-brand-features" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 26 }}>
              {FEATURES.map((f) => (
                <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5,
                  color: 'rgba(255,255,255,.92)', background: 'rgba(255,255,255,.10)',
                  border: '1px solid rgba(255,255,255,.18)', borderRadius: 999, padding: '6px 14px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffd166' }} />
                  {f}
                </span>
              ))}
            </div>
          </div>

          <div className="vb-brand-foot" style={{ position: 'relative', zIndex: 2, color: 'rgba(255,255,255,.6)', fontSize: 12 }}>
            © 2025 Bia Hạ Long
          </div>
        </aside>

        {/* ── Right: login card ── */}
        <main className="vb-login-panel">
          <div className="vb-card">
            <p style={{ fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', fontWeight: 700,
              color: '#0038a8', margin: '0 0 10px' }}>
              Đăng nhập
            </p>
            <h2 style={{ fontSize: 30, lineHeight: 1.15, color: '#0e1f4d', fontWeight: 700, margin: '0 0 8px',
              letterSpacing: '-.01em' }}>
              Chào mừng trở lại
            </h2>
            <p style={{ color: '#6b7aa3', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
              Đăng nhập bằng tài khoản Microsoft 365 Bia Hạ Long để truy cập hệ thống.
            </p>

            {errMsg && (
              <div style={{ background: '#fde7e9', color: '#a4262c', border: '1px solid #f3c2c6',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 }}>
                {errMsg}
              </div>
            )}

            <button type="button" className="vb-sso-btn" onClick={onSignIn} disabled={submitting}>
              <span className="vb-sso-ms"><MicrosoftLogo /></span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                {submitting ? 'Đang chuyển hướng…' : 'Đăng nhập với Microsoft 365'}
              </span>
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>→</span>
            </button>

            <p style={{ textAlign: 'center', fontSize: 12, color: '#6b7aa3', lineHeight: 1.5, margin: '14px 0 0' }}>
              Bạn sẽ được chuyển đến trang đăng nhập Microsoft (login.microsoftonline.com).
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, padding: '11px 14px',
              background: '#fafcff', border: '1px solid #e9f0fa', borderRadius: 10, fontSize: 12.5, color: '#6b7aa3' }}>
              <span aria-hidden style={{ flexShrink: 0, color: '#0038a8', fontWeight: 700 }}>ⓘ</span>
              <span>Chỉ dành cho tài khoản công ty <strong style={{ color: '#182f6f' }}>@biahalong.com</strong>.</span>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
