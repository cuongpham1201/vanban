'use client';

import * as React from 'react';

// Teams Channel Tab — trang CẤU HÌNH (Teams gọi khi user "Add a tab").
// Flow chuẩn TeamsJS v2:
//   app.initialize() → registerOnSaveHandler() → setValidityState(true) (bật nút "Lưu").
//   Khi user bấm Lưu: setConfig({contentUrl, websiteUrl, entityId}) → saveEvent.notifySuccess().
// KHÔNG cần đăng nhập (Teams mở trong iframe cấu hình); route nằm ngoài (dms) nên không bị middleware chặn.

const APP_URL = 'https://vanban.biahalong.com';
const ENTITY_ID = 'bhl-dms';
const TAB_NAME = 'Văn bản điều hành';

export default function TeamsConfigPage(): React.ReactElement {
  const [status, setStatus] = React.useState('Đang khởi tạo Microsoft Teams…');
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const teams = await import('@microsoft/teams-js');
        await teams.app.initialize();
        if (cancelled) return;
        const { pages } = teams;

        pages.config.registerOnSaveHandler((saveEvent) => {
          void pages.config
            .setConfig({
              entityId: ENTITY_ID,
              contentUrl: APP_URL,
              websiteUrl: APP_URL,
              suggestedDisplayName: TAB_NAME,
            })
            .then(() => saveEvent.notifySuccess())
            .catch(() => saveEvent.notifyFailure('Không lưu được cấu hình tab.'));
        });

        // Nội dung tab cố định → tab luôn hợp lệ → bật nút "Lưu" ngay.
        pages.config.setValidityState(true);
        if (!cancelled) {
          setReady(true);
          setStatus('Sẵn sàng. Bấm "Lưu" (Save) để thêm tab Văn bản điều hành vào kênh.');
        }
      } catch {
        if (!cancelled) {
          setStatus('Không khởi tạo được Teams SDK. Hãy mở trang này bên trong Microsoft Teams.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        fontFamily: "'Segoe UI', system-ui, Arial, sans-serif",
        color: '#15202e',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: '#143f7e' }}>BHL DMS — Văn bản điều hành</div>
      <p style={{ fontSize: 14, color: ready ? '#1f7a4d' : '#6f7e8e', maxWidth: 420, lineHeight: 1.5, margin: 0 }}>
        {status}
      </p>
      <div style={{ fontSize: 12, color: '#97a3b2' }}>{APP_URL}</div>
    </main>
  );
}
