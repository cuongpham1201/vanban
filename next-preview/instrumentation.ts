// BUG#26 — Prewarm documents cache lúc server start (non-blocking).
// Mục tiêu: request đầu của user KHÔNG gặp cold fetch ~22s. Nếu thiếu creds app-only
// hoặc lỗi mint token → bỏ qua êm (không crash boot). Chỉ chạy ở Node runtime.
export function register(): void {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  if (!process.env.AZURE_AD_TENANT_ID || !process.env.AZURE_AD_CLIENT_ID || !process.env.AZURE_AD_CLIENT_SECRET) {
    return; // không đủ creds → không prewarm (vd môi trường preview/mock)
  }
  // Fire-and-forget: không block boot.
  void (async () => {
    try {
      const { getAppOnlyGraphTokenReadOnly } = await import('@/lib/graph/appToken');
      const { prewarmDocumentsCache } = await import('@/lib/dms/documentsCache');
      const token = await getAppOnlyGraphTokenReadOnly();
      prewarmDocumentsCache(token);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[dms-perf] prewarm skipped:', e instanceof Error ? e.message : String(e));
    }
  })();
}
