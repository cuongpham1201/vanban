'use client';

import * as React from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import Icon from '@/components/shell/Icon';
import styles from './pdfCanvasViewer.module.css';

// Worker pdf.js — webpack (Next) phát asset & rewrite URL; KHÔNG dùng CDN. Chỉ set ở client.
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url
  ).toString();
}

type RenderTaskLike = { cancel: () => void; promise: Promise<void> };

// Padding 2 bên của .viewport (đồng bộ với pdfCanvasViewer.module.css .viewport padding).
const VIEWPORT_PADDING_X = 32; // 16px mỗi bên
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.2;

// Viewer PDF render bằng canvas (KHÔNG dùng plugin/iframe của trình duyệt) → chạy được trong
// sandbox iframe Teams VÀ fit-width đúng trên mobile/PWA (nơi iframe #view=FitH bị WebKit bỏ qua).
//   - scale MẶC ĐỊNH = FIT-WIDTH theo bề rộng container (không còn cố định 1.2 gây tràn/méo).
//   - ResizeObserver: tính lại khi xoay màn/resize/đổi width container.
//   - zoom +/− là HỆ SỐ nhân quanh fit (1 = vừa khung); nút "vừa khung" reset về 1.
export default function PdfCanvasViewer({
  fileUrl,
  downloadUrl,
  fileName,
}: {
  fileUrl: string;
  downloadUrl?: string;
  fileName?: string;
}): React.ReactElement {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const renderTaskRef = React.useRef<RenderTaskLike | null>(null);
  const [pdf, setPdf] = React.useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = React.useState(0);
  const [page, setPage] = React.useState(1);
  // zoom = hệ số nhân quanh fit-width (1 = vừa khung). KHÔNG còn scale tuyệt đối cố định.
  const [zoom, setZoom] = React.useState(1);
  // Bề rộng KHẢ DỤNG của container (đã trừ padding) — nguồn để tính fit-width. ResizeObserver cập nhật.
  const [availWidth, setAvailWidth] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Theo dõi bề rộng container (xoay màn/resize/đổi layout) → tính lại fit-width.
  React.useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    const measure = (): void => {
      const w = el.clientWidth - VIEWPORT_PADDING_X;
      setAvailWidth(Math.max(0, Math.floor(w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tải tài liệu PDF (fetch bytes same-origin → pdf.js parse).
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdf(null);
    setPage(1);
    setZoom(1);
    (async () => {
      try {
        const res = await fetch(fileUrl, { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Không tải được PDF (HTTP ${res.status}).`);
        }
        const buf = await res.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  // Render trang hiện tại lên canvas — scale = FIT-WIDTH (availWidth / bề rộng trang ở scale 1) × zoom.
  // Canvas style width/height lấy CÙNG viewport → đúng tỉ lệ (không méo). Bitmap × dpr cho nét.
  React.useEffect(() => {
    if (!pdf || !canvasRef.current || availWidth <= 0) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await pdf.getPage(page);
        if (cancelled || !canvasRef.current) {
          return;
        }
        // Bề rộng trang gốc (CSS px) ở scale 1 → suy ra fit-width cho đúng container.
        const baseWidth = p.getViewport({ scale: 1 }).width;
        const fitScale = baseWidth > 0 ? availWidth / baseWidth : 1;
        const effectiveScale = Math.max(0.05, fitScale * zoom);
        const dpr = window.devicePixelRatio || 1;
        const viewport = p.getViewport({ scale: effectiveScale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return;
        }
        // Bitmap theo dpr (nét trên màn retina); CSS px theo viewport (đúng tỉ lệ, ≤ container ở zoom=1).
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }
        const task = p.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        }) as unknown as RenderTaskLike;
        renderTaskRef.current = task;
        await task.promise;
      } catch {
        /* render bị hủy khi đổi trang/scale/resize — bỏ qua */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, page, zoom, availWidth]);

  const canPrev = page > 1;
  const canNext = page < numPages;
  const atFit = Math.abs(zoom - 1) < 0.001;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.group}>
          <button type="button" className={styles.btn} disabled={!canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Trang trước">
            <Icon name="chevright" size={16} />
          </button>
          <span className={styles.pageInfo}>{numPages ? `${page} / ${numPages}` : '—'}</span>
          <button type="button" className={styles.btn} disabled={!canNext} onClick={() => setPage((p) => Math.min(numPages, p + 1))} aria-label="Trang sau">
            <Icon name="chevright" size={16} />
          </button>
        </div>
        <div className={styles.group}>
          <button type="button" className={styles.btn} onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))} aria-label="Thu nhỏ">−</button>
          <span className={styles.pageInfo}>{Math.round(zoom * 100)}%</span>
          <button type="button" className={styles.btn} onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))} aria-label="Phóng to">+</button>
          <button type="button" className={styles.btn} disabled={atFit} onClick={() => setZoom(1)} aria-label="Vừa khung" title="Vừa khung">⤢</button>
        </div>
        <div style={{ flex: 1 }} />
        {downloadUrl && (
          <a className={styles.btn} href={downloadUrl} target="_blank" rel="noreferrer" title="Tải xuống">
            <Icon name="download" size={16} />
          </a>
        )}
      </div>

      <div className={styles.viewport} ref={viewportRef}>
        {loading && <div className={styles.state}>Đang tải PDF…</div>}
        {error && !loading && (
          <div className={styles.state}>
            <div className={styles.errTitle}>Không hiển thị được PDF.</div>
            <div className={styles.errMsg}>{error}</div>
            {downloadUrl && (
              <a className="btn btn-primary" href={downloadUrl} target="_blank" rel="noreferrer" style={{ marginTop: 12 }}>
                <Icon name="download" size={16} /> Tải xuống {fileName ? `“${fileName}”` : ''}
              </a>
            )}
          </div>
        )}
        {!error && <canvas ref={canvasRef} className={styles.canvas} style={{ display: loading ? 'none' : 'block' }} />}
      </div>
    </div>
  );
}
