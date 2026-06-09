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

// Viewer PDF render bằng canvas (KHÔNG dùng plugin/iframe của trình duyệt) → chạy được trong
// sandbox iframe của Microsoft Teams. Nguồn: same-origin proxy /api/documents/[id]/file.
export default function PdfCanvasViewer({
  fileUrl,
  downloadUrl,
  fileName,
}: {
  fileUrl: string;
  downloadUrl?: string;
  fileName?: string;
}): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const renderTaskRef = React.useRef<RenderTaskLike | null>(null);
  const [pdf, setPdf] = React.useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [scale, setScale] = React.useState(1.2);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Tải tài liệu PDF (fetch bytes same-origin → pdf.js parse).
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdf(null);
    setPage(1);
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

  // Render trang hiện tại lên canvas (hỗ trợ devicePixelRatio cho nét).
  React.useEffect(() => {
    if (!pdf || !canvasRef.current) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await pdf.getPage(page);
        if (cancelled || !canvasRef.current) {
          return;
        }
        const dpr = window.devicePixelRatio || 1;
        const viewport = p.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return;
        }
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
        /* render bị hủy khi đổi trang/scale — bỏ qua */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, page, scale]);

  const canPrev = page > 1;
  const canNext = page < numPages;

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
          <button type="button" className={styles.btn} onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))} aria-label="Thu nhỏ">−</button>
          <span className={styles.pageInfo}>{Math.round(scale * 100)}%</span>
          <button type="button" className={styles.btn} onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)))} aria-label="Phóng to">+</button>
        </div>
        <div style={{ flex: 1 }} />
        {downloadUrl && (
          <a className={styles.btn} href={downloadUrl} target="_blank" rel="noreferrer" title="Tải xuống">
            <Icon name="download" size={16} />
          </a>
        )}
      </div>

      <div className={styles.viewport}>
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
