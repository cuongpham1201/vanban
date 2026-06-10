'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { safeJsonFetch } from '@/lib/client/safeJsonFetch';

// Tab Hệ thống — provisioning + seed + health cho DMS Notifications (mô hình Approval BHL).
interface ProvisionResult {
  ok: boolean;
  created?: boolean;
  validated?: boolean;
  addedColumns?: string[];
  indexedColumns?: string[];
  missingLists?: string[];
  missingColumns?: string[];
  missingIndexes?: string[];
  error?: string;
  detail?: string;
}
interface Health {
  ok: boolean;
  listExists?: boolean;
  schemaValid?: boolean;
  itemCount?: number;
  unreadCount?: number;
  emailEnabled?: boolean;
  graphReady?: boolean;
  missingLists?: string[];
  missingColumns?: string[];
  missingIndexes?: string[];
  error?: string;
}

export default function SystemTab(): React.ReactElement {
  const [provisioning, setProvisioning] = React.useState(false);
  const [provision, setProvision] = React.useState<ProvisionResult | null>(null);
  const [seeding, setSeeding] = React.useState(false);
  const [seedMsg, setSeedMsg] = React.useState<string | null>(null);
  const [health, setHealth] = React.useState<Health | null>(null);
  const [loadingHealth, setLoadingHealth] = React.useState(false);

  const loadHealth = React.useCallback(async () => {
    setLoadingHealth(true);
    const { data, parseError } = await safeJsonFetch<Health>('/api/admin/notifications/health', { cache: 'no-store' });
    setHealth(parseError ? { ok: false, error: parseError } : data ?? { ok: false, error: 'Không có dữ liệu.' });
    setLoadingHealth(false);
  }, []);

  React.useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const onProvision = async (): Promise<void> => {
    setProvisioning(true);
    setProvision(null);
    const { data, parseError } = await safeJsonFetch<ProvisionResult>('/api/admin/provision-notifications', { method: 'POST' });
    setProvision(parseError ? { ok: false, error: parseError } : data ?? { ok: false, error: 'Không có phản hồi.' });
    void loadHealth();
    setProvisioning(false);
  };

  const onSeed = async (): Promise<void> => {
    setSeeding(true);
    setSeedMsg(null);
    const { data, parseError } = await safeJsonFetch<{ ok: boolean; created?: number; error?: string }>(
      '/api/admin/seed-notifications',
      { method: 'POST' }
    );
    if (parseError) setSeedMsg(`Lỗi: ${parseError}`);
    else if (data?.ok) setSeedMsg(`Đã tạo ${data.created} thông báo mẫu. Mở chuông để kiểm tra.`);
    else setSeedMsg(`Lỗi: ${data?.error ?? 'Không tạo được.'}`);
    void loadHealth();
    setSeeding(false);
  };

  const badge = (label: string, ok: boolean | undefined): React.ReactElement => (
    <span className={`badge ${ok ? 'badge-ok' : 'badge-neutral'}`} style={{ padding: '2px 8px' }}>
      {label}: {ok ? 'Có' : 'Không'}
    </span>
  );

  return (
    <div className="apane on">
      <div className="adm-head">
        <div>
          <h1>Hệ thống thông báo</h1>
          <div className="t-sm mut">Provisioning SharePoint list DMSNotifications · seed dữ liệu mẫu · kiểm tra sức khỏe</div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void loadHealth()} disabled={loadingHealth}>
          {loadingHealth ? 'Đang tải…' : 'Làm mới'}
        </button>
      </div>

      {/* Health */}
      <div className="adm-panelcard" style={{ marginBottom: 18 }}>
        <div className="adm-toolbar"><span className="t-xs mut" style={{ fontWeight: 700 }}>Tình trạng (DMSNotifications + DMSNotificationReads)</span></div>
        <div style={{ padding: 16 }}>
          {health ? (
            health.ok ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {badge('List tồn tại', health.listExists)}
                  {badge('Schema hợp lệ', health.schemaValid)}
                  <span className="badge badge-navy" style={{ padding: '2px 8px' }}>Items: {health.itemCount ?? 0}</span>
                  <span className="badge badge-navy" style={{ padding: '2px 8px' }}>Chưa đọc: {health.unreadCount ?? 0}</span>
                  {badge('Email bật', health.emailEnabled)}
                  {badge('Graph sẵn sàng', health.graphReady)}
                </div>
                {!health.schemaValid && (
                  <div className="t-xs" style={{ marginTop: 10, color: 'var(--danger-700)' }}>
                    {health.missingLists && health.missingLists.length > 0 && <div>Thiếu list: {health.missingLists.join(', ')}</div>}
                    {health.missingColumns && health.missingColumns.length > 0 && <div>Thiếu cột: {health.missingColumns.join(', ')}</div>}
                    {health.missingIndexes && health.missingIndexes.length > 0 && <div>Thiếu index: {health.missingIndexes.join(', ')}</div>}
                    <div className="mut" style={{ marginTop: 4 }}>Bấm “Provision DMS Notifications” để bổ sung.</div>
                  </div>
                )}
              </>
            ) : (
              <span className="t-sm" style={{ color: 'var(--danger-700)' }}>{health.error ?? 'Không lấy được tình trạng (cần quyền admin).'}</span>
            )
          ) : (
            <span className="t-sm mut">Đang tải…</span>
          )}
        </div>
      </div>

      {/* Provision */}
      <div className="adm-panelcard" style={{ marginBottom: 18 }}>
        <div className="adm-toolbar"><span className="t-xs mut" style={{ fontWeight: 700 }}>Provisioning</span></div>
        <div style={{ padding: 16 }}>
          <p className="t-sm mut" style={{ marginTop: 0 }}>
            Tạo list DMSNotifications nếu chưa có, hoặc kiểm tra &amp; bổ sung cột thiếu. Cần quyền admin (canWrite).
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void onProvision()} disabled={provisioning}>
            <Icon name="admin" size={16} /> {provisioning ? 'Đang xử lý…' : 'Provision DMS Notifications'}
          </button>

          {provision && (
            <div
              style={{
                marginTop: 14, padding: '12px 14px', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)',
                background: provision.ok ? 'var(--success-100)' : 'var(--danger-100)',
                border: `1px solid ${provision.ok ? 'var(--success-500)' : 'var(--danger-500)'}`,
              }}
            >
              {provision.ok || provision.validated ? (
                <>
                  <div><b>{provision.created ? 'Đã tạo list mới' : 'List đã tồn tại'}</b> · Schema hợp lệ ✓</div>
                  {provision.addedColumns && provision.addedColumns.length > 0 && (
                    <div className="t-xs" style={{ marginTop: 4 }}>Cột đã thêm: {provision.addedColumns.join(', ')}</div>
                  )}
                  {provision.indexedColumns && provision.indexedColumns.length > 0 && (
                    <div className="t-xs" style={{ marginTop: 4 }}>Index đã bật: {provision.indexedColumns.join(', ')}</div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ color: 'var(--danger-700)' }}><b>{provision.error ?? 'Schema chưa đầy đủ'}</b></div>
                  {provision.missingLists && provision.missingLists.length > 0 && (
                    <div className="t-xs" style={{ marginTop: 6 }}><b>Thiếu list:</b><ul style={{ margin: '2px 0 0 18px' }}>{provision.missingLists.map((x) => <li key={x}>{x}</li>)}</ul></div>
                  )}
                  {provision.missingColumns && provision.missingColumns.length > 0 && (
                    <div className="t-xs" style={{ marginTop: 6 }}><b>Thiếu cột:</b><ul style={{ margin: '2px 0 0 18px' }}>{provision.missingColumns.map((x) => <li key={x}>{x}</li>)}</ul></div>
                  )}
                  {provision.missingIndexes && provision.missingIndexes.length > 0 && (
                    <div className="t-xs" style={{ marginTop: 6 }}><b>Thiếu index:</b><ul style={{ margin: '2px 0 0 18px' }}>{provision.missingIndexes.map((x) => <li key={x}>{x}</li>)}</ul></div>
                  )}
                  {provision.detail && <div className="t-2xs mut" style={{ marginTop: 6 }}>{provision.detail}</div>}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Seed */}
      <div className="adm-panelcard">
        <div className="adm-toolbar"><span className="t-xs mut" style={{ fontWeight: 700 }}>Dữ liệu mẫu</span></div>
        <div style={{ padding: 16 }}>
          <p className="t-sm mut" style={{ marginTop: 0 }}>
            Tạo 3 thông báo mẫu (NEW_DOCUMENT · DOCUMENT_REPLACED · SYSTEM) cho tài khoản hiện tại để kiểm tra chuông.
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => void onSeed()} disabled={seeding}>
            <Icon name="bell" size={16} /> {seeding ? 'Đang tạo…' : 'Tạo thông báo mẫu'}
          </button>
          {seedMsg && <div className="t-sm" style={{ marginTop: 12 }}>{seedMsg}</div>}
        </div>
      </div>
    </div>
  );
}
