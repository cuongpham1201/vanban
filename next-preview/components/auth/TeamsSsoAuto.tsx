'use client';

// #31 — Auto Teams SSO gate. Khi app chạy trong Teams: init → getAuthToken → signIn('teams-sso')
// → chờ session → redirect. Ngoài Teams: render null (caller hiện UI web bình thường — KHÔNG phá).
// Fail/timeout → fallback overlay: Thử lại / Đăng nhập Microsoft 365 / Mở trên trình duyệt.
import * as React from 'react';
import { signIn, getSession } from 'next-auth/react';
import { isInTeamsHostFast, initTeams, getTeamsSsoToken, openExternal } from '@/lib/teams/teamsClient';

type Phase = 'idle' | 'detecting' | 'fetching' | 'signing-in' | 'session-wait' | 'success' | 'failed';

const SESSION_MAX_ATTEMPTS = 8;
const SESSION_DELAY_MS = 500;
const SS_DONE = 'bhl.teams.sso.done';

export default function TeamsSsoAuto({ callbackUrl }: { callbackUrl: string }): React.ReactElement | null {
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [errorDetail, setErrorDetail] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const waitForSession = React.useCallback(async (cancelled: () => boolean): Promise<boolean> => {
    for (let i = 1; i <= SESSION_MAX_ATTEMPTS; i++) {
      if (cancelled()) return false;
      await new Promise((r) => setTimeout(r, SESSION_DELAY_MS));
      const s = await getSession();
      if (s?.user?.email) return true;
    }
    return false;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const isCancelled = (): boolean => cancelled;
    async function run(): Promise<void> {
      if (!isInTeamsHostFast()) return; // ngoài Teams → để caller hiện web UI
      setPhase('detecting');
      const inTeams = await initTeams();
      if (cancelled) return;
      if (!inTeams) { setPhase('idle'); return; } // xác nhận không trong Teams → web UI

      // đã có session sẵn → vào thẳng
      const existing = await getSession();
      if (cancelled) return;
      if (existing?.user?.email) { window.location.replace(callbackUrl); return; }

      setPhase('fetching');
      const token = await getTeamsSsoToken();
      if (cancelled) return;
      if (!token) {
        setErrorDetail('Teams chưa trả về SSO token (có thể chưa cấp quyền/consent hoặc thiếu cấu hình Entra).');
        setPhase('failed');
        return;
      }

      setPhase('signing-in');
      const res = await signIn('teams-sso', { token, redirect: false });
      if (cancelled) return;
      if (!res || !res.ok || res.error) {
        setErrorDetail(res?.error ?? 'Đăng nhập Teams SSO thất bại (kiểm tra Expose API / OBO trên Entra).');
        setPhase('failed');
        return;
      }

      setPhase('session-wait');
      const ok = await waitForSession(isCancelled);
      if (cancelled) return;
      if (!ok) {
        setErrorDetail('Đã xác thực Teams nhưng chưa tạo được phiên (cookie iframe?). Hãy mở trên trình duyệt.');
        setPhase('failed');
        return;
      }
      try { sessionStorage.setItem(SS_DONE, '1'); } catch { /* ignore */ }
      setPhase('success');
      window.location.replace(callbackUrl);
    }
    void run();
    return () => { cancelled = true; };
  }, [callbackUrl, waitForSession, nonce]);

  // Ngoài Teams (idle) → render null để caller hiện UI web.
  if (phase === 'idle') return null;

  const loading = phase === 'detecting' || phase === 'fetching' || phase === 'signing-in' || phase === 'session-wait' || phase === 'success';
  const msg: Record<Phase, string> = {
    idle: '', detecting: 'Đang kết nối Microsoft Teams…', fetching: 'Đang lấy tài khoản Teams…',
    'signing-in': 'Đang đăng nhập bằng tài khoản Teams…', 'session-wait': 'Đang khởi tạo phiên…',
    success: 'Đăng nhập thành công, đang chuyển trang…', failed: '',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', padding: 24,
      background: 'linear-gradient(155deg,#0038a8 0%,#002356 100%)', color: '#fff', fontFamily: 'Segoe UI,system-ui,sans-serif' }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>Văn bản điều hành — Microsoft Teams</div>
        {loading ? (
          <>
            <div style={{ width: 28, height: 28, margin: '0 auto 14px', border: '3px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'bhlspin 0.9s linear infinite' }} />
            <div style={{ fontSize: 15 }}>{msg[phase]}</div>
            <style>{'@keyframes bhlspin{to{transform:rotate(360deg)}}'}</style>
          </>
        ) : (
          <div style={{ background: '#fff', color: '#0e1f4d', borderRadius: 14, padding: 24, textAlign: 'left' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Không thể đăng nhập tự động</h2>
            <p style={{ margin: '0 0 12px', fontSize: 13.5, color: '#6b7aa3', lineHeight: 1.55 }}>
              Đăng nhập tự động trong Teams chưa hoàn tất. Bạn có thể thử lại, hoặc mở trên trình duyệt để đăng nhập đầy đủ.
            </p>
            {errorDetail && (
              <p style={{ margin: '0 0 12px', padding: '8px 10px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-word' }}>{errorDetail}</p>
            )}
            <button type="button" onClick={() => { setErrorDetail(null); setPhase('detecting'); setNonce((n) => n + 1); }}
              style={{ width: '100%', marginBottom: 10, padding: '11px 16px', fontSize: 14, fontWeight: 600, background: '#0038a8', color: '#fff', border: 0, borderRadius: 10, cursor: 'pointer' }}>
              Thử lại
            </button>
            <button type="button" onClick={() => void signIn('azure-ad', { callbackUrl })}
              style={{ width: '100%', marginBottom: 10, padding: '11px 16px', fontSize: 14, fontWeight: 600, background: '#fff', color: '#0038a8', border: '1.5px solid #0038a8', borderRadius: 10, cursor: 'pointer' }}>
              Đăng nhập với Microsoft 365
            </button>
            <button type="button" onClick={() => void openExternal(typeof window !== 'undefined' ? window.location.origin + callbackUrl : callbackUrl)}
              style={{ width: '100%', padding: '11px 16px', fontSize: 14, fontWeight: 600, background: '#fff', color: '#0e1f4d', border: '1.5px solid #0e1f4d', borderRadius: 10, cursor: 'pointer' }}>
              Mở trên trình duyệt
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
