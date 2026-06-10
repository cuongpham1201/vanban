'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import {
  NotificationTemplate,
  NotificationChannel,
  TEMPLATE_EVENTS,
  TEMPLATE_CHANNELS,
  EVENT_LABELS,
  CHANNEL_LABELS,
  PLACEHOLDER_FIELDS,
  SAMPLE_CONTEXT,
} from '@/lib/dms/notifications/templates/templateConstants';
import { renderNotificationTemplate } from '@/lib/dms/notifications/templates/templateRenderer';
import { safeJsonFetch } from '@/lib/client/safeJsonFetch';

type EditableField = 'titleTemplate' | 'bodyTemplate' | 'detailTemplate' | 'actionLabel' | 'actionUrlTemplate';
type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; msg?: string };

interface Rendered {
  enabled: boolean;
  title: string;
  body: string;
  detail: string;
  actionLabel: string;
  actionUrl: string;
}

function keyOf(eventType: string, channel: string): string {
  return `${eventType}::${channel}`;
}

// Nhãn tiếng Việt cho từng field theo kênh.
function fieldLabels(channel: NotificationChannel): Record<EditableField, string> {
  if (channel === 'email') {
    return {
      titleTemplate: 'Tiêu đề email (Subject)',
      bodyTemplate: 'Dòng tiêu đề (Heading)',
      detailTemplate: 'Nội dung chi tiết (mỗi dòng "Nhãn: giá trị")',
      actionLabel: 'Nhãn nút',
      actionUrlTemplate: 'URL nút',
    };
  }
  if (channel === 'teamsActivity') {
    return {
      titleTemplate: 'Topic (nhãn ngắn)',
      bodyTemplate: 'documentInfo',
      detailTemplate: 'previewText',
      actionLabel: 'Nhãn (không dùng)',
      actionUrlTemplate: 'Action URL (deep link tự dựng)',
    };
  }
  return {
    titleTemplate: 'Tiêu đề',
    bodyTemplate: 'Nội dung / Preview',
    detailTemplate: 'Chi tiết',
    actionLabel: 'Nhãn hành động',
    actionUrlTemplate: 'URL hành động',
  };
}

export default function NotificationTemplatesTab(): React.ReactElement {
  const [templates, setTemplates] = React.useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [canWrite, setCanWrite] = React.useState<boolean | null>(null);

  const [ev, setEv] = React.useState<string>(TEMPLATE_EVENTS[0]);
  const [ch, setCh] = React.useState<NotificationChannel>('web');
  const [draft, setDraft] = React.useState<NotificationTemplate | null>(null);
  const [save, setSave] = React.useState<SaveState>({ kind: 'idle' });
  const [serverPreview, setServerPreview] = React.useState<Rendered | null>(null);
  const [testing, setTesting] = React.useState(false);
  const focusedRef = React.useRef<EditableField>('bodyTemplate');

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    const { data, parseError } = await safeJsonFetch<{ ok: boolean; templates?: NotificationTemplate[]; error?: string }>(
      '/api/admin/notifications/templates',
      { cache: 'no-store' }
    );
    if (parseError) setLoadErr(parseError);
    else if (data?.ok && Array.isArray(data.templates)) setTemplates(data.templates);
    else setLoadErr(data?.error ?? 'Không tải được template.');
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
    void safeJsonFetch<{ canWrite?: boolean }>('/api/dms/write-status').then(({ data }) => setCanWrite(!!data?.canWrite));
  }, [load]);

  // Khi đổi event/channel hoặc templates đổi → nạp draft từ template hiệu lực tương ứng.
  React.useEffect(() => {
    const found = templates.find((t) => keyOf(t.eventType, t.channel) === keyOf(ev, ch));
    if (found) setDraft({ ...found });
    setSave({ kind: 'idle' });
    setServerPreview(null);
  }, [ev, ch, templates]);

  const upd = (field: EditableField, value: string): void => {
    setDraft((d) => (d ? { ...d, [field]: value } : d));
    setSave({ kind: 'idle' });
  };

  const insertField = (token: string): void => {
    const field = focusedRef.current;
    setDraft((d) => (d ? { ...d, [field]: `${d[field] ?? ''}${token}` } : d));
  };

  const onSave = async (): Promise<void> => {
    if (!draft) return;
    setSave({ kind: 'saving' });
    const { data, parseError } = await safeJsonFetch<{ ok: boolean; effective?: NotificationTemplate; error?: string }>(
      `/api/admin/notifications/templates/${encodeURIComponent(ev)}/${encodeURIComponent(ch)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: draft.enabled,
          titleTemplate: draft.titleTemplate,
          bodyTemplate: draft.bodyTemplate,
          detailTemplate: draft.detailTemplate,
          actionLabel: draft.actionLabel,
          actionUrlTemplate: draft.actionUrlTemplate,
        }),
      }
    );
    if (parseError) {
      setSave({ kind: 'error', msg: parseError });
    } else if (data?.ok && data.effective) {
      const eff = data.effective;
      setTemplates((arr) => arr.map((t) => (keyOf(t.eventType, t.channel) === keyOf(ev, ch) ? eff : t)));
      setSave({ kind: 'saved' });
      window.setTimeout(() => setSave((s) => (s.kind === 'saved' ? { kind: 'idle' } : s)), 2500);
    } else {
      setSave({ kind: 'error', msg: data?.error ?? 'Lưu thất bại.' });
    }
  };

  const onReset = async (): Promise<void> => {
    if (!window.confirm('Khôi phục template mặc định cho sự kiện/kênh này?')) return;
    setSave({ kind: 'saving' });
    const { data, parseError } = await safeJsonFetch<{ ok: boolean; effective?: NotificationTemplate; error?: string }>(
      `/api/admin/notifications/templates/${encodeURIComponent(ev)}/${encodeURIComponent(ch)}/reset`,
      { method: 'POST' }
    );
    if (parseError) {
      setSave({ kind: 'error', msg: parseError });
    } else if (data?.ok && data.effective) {
      const eff = data.effective;
      setTemplates((arr) => arr.map((t) => (keyOf(t.eventType, t.channel) === keyOf(ev, ch) ? eff : t)));
      setDraft({ ...eff });
      setSave({ kind: 'saved' });
      window.setTimeout(() => setSave((s) => (s.kind === 'saved' ? { kind: 'idle' } : s)), 2500);
    } else {
      setSave({ kind: 'error', msg: data?.error ?? 'Reset thất bại.' });
    }
  };

  const onTestRender = async (): Promise<void> => {
    if (!draft) return;
    setTesting(true);
    setServerPreview(null);
    const { data, parseError } = await safeJsonFetch<{ ok: boolean; rendered?: Rendered; error?: string }>(
      '/api/admin/notifications/templates/preview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: ev, channel: ch, template: draft }),
      }
    );
    if (parseError) setSave({ kind: 'error', msg: parseError });
    else if (data?.ok && data.rendered) setServerPreview(data.rendered);
    else setSave({ kind: 'error', msg: data?.error ?? 'Render thất bại.' });
    setTesting(false);
  };

  // Live preview client-side (giống logic server: renderNotificationTemplate + SAMPLE_CONTEXT).
  const livePreview: Rendered | null = draft
    ? {
        enabled: draft.enabled,
        title: renderNotificationTemplate(draft.titleTemplate, SAMPLE_CONTEXT),
        body: renderNotificationTemplate(draft.bodyTemplate, SAMPLE_CONTEXT),
        detail: renderNotificationTemplate(draft.detailTemplate, SAMPLE_CONTEXT),
        actionLabel: renderNotificationTemplate(draft.actionLabel, SAMPLE_CONTEXT),
        actionUrl: renderNotificationTemplate(draft.actionUrlTemplate, SAMPLE_CONTEXT),
      }
    : null;

  const labels = fieldLabels(ch);
  const readOnly = canWrite === false;

  const editor = (field: EditableField, multiline = false): React.ReactElement => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span className="t-xs mut" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>{labels[field]}</span>
      {multiline ? (
        <textarea
          className="adm-input"
          value={draft?.[field] ?? ''}
          onFocus={() => (focusedRef.current = field)}
          onChange={(e) => upd(field, e.target.value)}
          disabled={readOnly}
          rows={field === 'detailTemplate' ? 4 : 2}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: 'var(--r-sm)' }}
        />
      ) : (
        <input
          type="text"
          value={draft?.[field] ?? ''}
          onFocus={() => (focusedRef.current = field)}
          onChange={(e) => upd(field, e.target.value)}
          disabled={readOnly}
          style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: 'var(--r-sm)' }}
        />
      )}
    </label>
  );

  return (
    <div className="apane on">
      <div className="adm-head">
        <div>
          <h1>Quản trị thông báo</h1>
          <div className="t-sm mut">Cấu hình nội dung thông báo theo sự kiện × kênh (Web · Email · Teams). Lưu tại DMSConfig.</div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Đang tải…' : 'Làm mới'}
        </button>
      </div>

      {loadErr && (
        <div className="adm-panelcard" style={{ marginBottom: 16, padding: 14, color: 'var(--danger-700)' }}>
          <b>Lỗi:</b> {loadErr}
        </div>
      )}

      {/* Selector */}
      <div className="adm-panelcard" style={{ marginBottom: 16 }}>
        <div style={{ padding: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'block' }}>
            <span className="t-xs mut" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>Sự kiện</span>
            <select value={ev} onChange={(e) => setEv(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: 'var(--r-sm)', minWidth: 220 }}>
              {TEMPLATE_EVENTS.map((e) => (
                <option key={e} value={e}>{EVENT_LABELS[e] ?? e}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <span className="t-xs mut" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>Kênh</span>
            <select value={ch} onChange={(e) => setCh(e.target.value as NotificationChannel)} style={{ padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: 'var(--r-sm)', minWidth: 200 }}>
              {TEMPLATE_CHANNELS.map((c) => (
                <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
            <input type="checkbox" checked={!!draft?.enabled} disabled={readOnly} onChange={(e) => setDraft((d) => (d ? { ...d, enabled: e.target.checked } : d))} />
            <span className="t-sm" style={{ fontWeight: 600 }}>Bật kênh này cho sự kiện</span>
          </label>
          {readOnly && <span className="t-xs" style={{ color: 'var(--warning-700)', paddingBottom: 8 }}>Chỉ xem (không có quyền ghi DMS)</span>}
        </div>
      </div>

      {draft && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          {/* Editors */}
          <div className="adm-panelcard">
            <div className="adm-toolbar"><span className="t-xs mut" style={{ fontWeight: 700 }}>Nội dung template</span></div>
            <div style={{ padding: 16 }}>
              {editor('titleTemplate', false)}
              {editor('bodyTemplate', true)}
              {editor('detailTemplate', true)}
              {ch !== 'teamsActivity' && editor('actionLabel', false)}
              {ch !== 'teamsActivity' && editor('actionUrlTemplate', false)}
              <div className="t-xs mut" style={{ marginTop: 4 }}>Trường dùng: {draft.fields.length ? draft.fields.map((f) => `{{${f}}}`).join(' ') : '—'}</div>

              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={readOnly || save.kind === 'saving'}>
                  <Icon name="admin" size={16} /> {save.kind === 'saving' ? 'Đang lưu…' : 'Lưu'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void onReset()} disabled={readOnly || save.kind === 'saving'}>
                  Khôi phục mặc định
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void onTestRender()} disabled={testing}>
                  {testing ? 'Đang render…' : 'Test render (server)'}
                </button>
                {save.kind === 'saved' && <span className="t-sm" style={{ color: 'var(--success-700)', alignSelf: 'center' }}>Đã lưu ✓</span>}
                {save.kind === 'error' && <span className="t-sm" style={{ color: 'var(--danger-700)', alignSelf: 'center' }}>Lỗi: {save.msg}</span>}
              </div>
            </div>
          </div>

          {/* Right column: fields + preview */}
          <div>
            <div className="adm-panelcard" style={{ marginBottom: 16 }}>
              <div className="adm-toolbar"><span className="t-xs mut" style={{ fontWeight: 700 }}>Trường khả dụng (bấm để chèn)</span></div>
              <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PLACEHOLDER_FIELDS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className="badge badge-navy"
                    title={f.label}
                    onClick={() => insertField(`{{${f.key}}}`)}
                    style={{ cursor: 'pointer', border: 'none', padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)' }}
                  >
                    {`{{${f.key}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="adm-panelcard">
              <div className="adm-toolbar"><span className="t-xs mut" style={{ fontWeight: 700 }}>Xem trước (dữ liệu mẫu)</span></div>
              <div style={{ padding: 16 }}>
                {!draft.enabled && <div className="badge badge-neutral" style={{ marginBottom: 10 }}>Kênh đang TẮT cho sự kiện này</div>}
                {livePreview && (
                  <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--r-md)', padding: 14, background: 'var(--gray-050)' }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', marginBottom: 6 }}>{livePreview.title || '—'}</div>
                    <div style={{ fontSize: 'var(--fs-sm)', whiteSpace: 'pre-wrap', marginBottom: 6 }}>{livePreview.body || '—'}</div>
                    <div className="t-xs mut" style={{ whiteSpace: 'pre-wrap' }}>{livePreview.detail || '—'}</div>
                    {ch !== 'teamsActivity' && (
                      <div style={{ marginTop: 10 }}>
                        <span className="badge badge-navy" style={{ padding: '3px 10px' }}>{livePreview.actionLabel || 'Mở'}</span>
                        <span className="t-2xs mut" style={{ marginLeft: 8 }}>{livePreview.actionUrl}</span>
                      </div>
                    )}
                  </div>
                )}
                {serverPreview && (
                  <div style={{ marginTop: 12 }}>
                    <div className="t-xs mut" style={{ fontWeight: 700, marginBottom: 6 }}>Kết quả render từ server (enabled: {String(serverPreview.enabled)})</div>
                    <pre style={{ margin: 0, fontSize: 'var(--fs-2xs)', background: 'var(--gray-100)', padding: 10, borderRadius: 'var(--r-sm)', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
{JSON.stringify(serverPreview, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
