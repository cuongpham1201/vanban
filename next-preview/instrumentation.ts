// BUG#26 — Prewarm documents cache lúc server start (non-blocking).
// Mục tiêu: request đầu của user KHÔNG gặp cold fetch ~22s. Nếu thiếu creds app-only
// hoặc lỗi mint token → bỏ qua êm (không crash boot). Chỉ chạy ở Node runtime.
export function register(): void {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  // FIX B (504 PDF preview + unread-count "fetch failed"): IPv6 egress của server đang HỎNG
  // (curl -6 tới biahalong.sharepoint.com / graph.microsoft.com đều fail; curl -4 OK). Node/undici
  // mặc định thử bản ghi AAAA (IPv6) trước → fetch ETIMEDOUT/"fetch failed" gián đoạn → Cloudflare
  // 504. Ép phân giải IPv4 trước ở cấp TIẾN TRÌNH (tương đương cờ --dns-result-order=ipv4first).
  // Best-effort, đặt trước cả nhánh thiếu creds để LUÔN áp dụng. KHÔNG chặn boot.
  void (async () => {
    try {
      const dns = await import(/* webpackIgnore: true */ 'node:dns');
      dns.setDefaultResultOrder('ipv4first');
      // eslint-disable-next-line no-console
      console.log('[dms-net] dns default result order = ipv4first');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[dms-net] set ipv4first failed:', e instanceof Error ? e.message : String(e));
    }
  })();
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
