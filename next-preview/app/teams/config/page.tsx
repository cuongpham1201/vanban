'use client';

import * as React from 'react';

// Teams Channel Tab — trang CẤU HÌNH (Teams gọi khi user "Add a tab").
// Flow chuẩn TeamsJS v2 (Microsoft docs "Create a configuration page"):
//   app.initialize() → (getContext) → registerOnSaveHandler() → setValidityState(true).
//   Save chỉ bật khi: initialize xong + đăng ký save handler + setValidityState(true), và
//   pages.config phải được host hỗ trợ (frameContext = settings).
// Trang chỉ render màn hình cấu hình nhỏ + debug states; KHÔNG render nội dung app chính.

const CONTENT_URL = 'https://vanban.biahalong.com/search?inTeams=1';
const WEBSITE_URL = 'https://vanban.biahalong.com/search';
const ENTITY_ID = 'bhl-dms-search';
const TAB_NAME = 'Quản lý văn bản';

interface Steps {
  loaded: boolean;
  teamsInitialized: boolean;
  frameContext: string;
  configSupported: boolean | null;
  saveHandlerRegistered: boolean;
  validitySet: boolean;
  saveCalled: boolean;
  setConfigResult: string;
  error: string;
}

const log = (...a: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.log('[teams-config]', ...a);
};

export default function TeamsConfigPage(): React.ReactElement {
  const [s, setS] = React.useState<Steps>({
    loaded: true,
    teamsInitialized: false,
    frameContext: '',
    configSupported: null,
    saveHandlerRegistered: false,
    validitySet: false,
    saveCalled: false,
    setConfigResult: '',
    error: '',
  });
  const patch = React.useCallback((p: Partial<Steps>) => setS((prev) => ({ ...prev, ...p })), []);

  React.useEffect(() => {
    let cancelled = false;
    log('page loaded');
    (async () => {
      try {
        const teams = await import('@microsoft/teams-js');
        const { app, pages } = teams;

        await app.initialize();
        if (cancelled) return;
        log('app.initialize() done');
        patch({ teamsInitialized: true });

        // Context (debug) — frameContext nên là "settings" trong dialog add-tab.
        try {
          const ctx = await app.getContext();
          if (!cancelled) {
            const fc = String(ctx?.page?.frameContext ?? '');
            log('context frameContext =', fc);
            patch({ frameContext: fc });
          }
        } catch (e) {
          log('getContext failed', e);
        }

        const supported = pages.config.isSupported();
        log('pages.config.isSupported() =', supported);
        patch({ configSupported: supported });

        // Đăng ký save handler TRƯỚC khi bật validity.
        pages.config.registerOnSaveHandler((saveEvent) => {
          log('onSave called');
          patch({ saveCalled: true });
          void pages.config
            .setConfig({
              entityId: ENTITY_ID,
              contentUrl: CONTENT_URL,
              websiteUrl: WEBSITE_URL,
              suggestedDisplayName: TAB_NAME,
            })
            .then(() => {
              log('setConfig success');
              patch({ setConfigResult: 'success' });
              saveEvent.notifySuccess();
            })
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              log('setConfig failed', msg);
              patch({ setConfigResult: 'fail: ' + msg });
              saveEvent.notifyFailure('Không lưu được cấu hình tab.');
            });
        });
        log('registerOnSaveHandler done');
        patch({ saveHandlerRegistered: true });

        // Bật nút "Lưu" (nội dung tab cố định → luôn hợp lệ).
        pages.config.setValidityState(true);
        log('setValidityState(true) done');
        patch({ validitySet: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log('ERROR', msg);
        if (!cancelled) patch({ error: msg });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patch]);

  const row = (label: string, ok: boolean | null, extra?: string): React.ReactElement => (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
      <span style={{ width: 16, textAlign: 'center', color: ok ? '#1f7a4d' : ok === false ? '#a32626' : '#97a3b2' }}>
        {ok ? '✓' : ok === false ? '✗' : '…'}
      </span>
      <span style={{ color: '#586675' }}>{label}</span>
      {extra ? <span style={{ color: '#97a3b2' }}>{extra}</span> : null}
    </div>
  );

  const ready = s.validitySet && s.saveHandlerRegistered;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        fontFamily: "'Segoe UI', system-ui, Arial, sans-serif",
        color: '#15202e',
        textAlign: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#143f7e' }}>Quản lý văn bản</div>
        <p style={{ fontSize: 14, color: '#586675', maxWidth: 420, lineHeight: 1.5, margin: '8px 0 0' }}>
          Hệ thống Quản lý văn bản của Công ty CP Bia và Nước giải khát Hạ Long
        </p>
        <p style={{ fontSize: 13, color: ready ? '#1f7a4d' : '#6f7e8e', margin: '8px 0 0' }}>
          {ready ? 'Sẵn sàng — bấm "Lưu" (Save) để thêm tab.' : 'Đang khởi tạo Microsoft Teams…'}
        </p>
      </div>

      {/* Debug states (giúp chẩn đoán nếu Save vẫn disabled trong Teams) */}
      <div style={{ textAlign: 'left', background: '#f7f9fc', border: '1px solid #e1e6ed', borderRadius: 8, padding: '12px 14px', minWidth: 300 }}>
        {row('Page loaded', s.loaded)}
        {row('Teams initialized', s.teamsInitialized)}
        {row('Frame context', s.frameContext ? true : null, s.frameContext || '(chưa có)')}
        {row('pages.config supported', s.configSupported)}
        {row('Save handler registered', s.saveHandlerRegistered)}
        {row('Validity set (Save enabled)', s.validitySet)}
        {row('Save clicked', s.saveCalled || null)}
        {s.setConfigResult ? row('setConfig', s.setConfigResult === 'success', s.setConfigResult) : null}
        {s.error ? row('Error', false, s.error) : null}
      </div>
      <div style={{ fontSize: 11, color: '#97a3b2' }}>{CONTENT_URL}</div>
    </main>
  );
}
