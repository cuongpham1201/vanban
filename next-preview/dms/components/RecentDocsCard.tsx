'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IDocument } from '../models/IDocument';
import { formatDate } from '../utils/format';
import { PdfFileIcon, WordFileIcon, ArrowRightIcon } from './Icons';

export interface IRecentDocsCardProps {
  documents: IDocument[];
  onClickItem?: (doc: IDocument) => void;
  onShowAll?: () => void;
}

export default function RecentDocsCard(props: IRecentDocsCardProps): React.ReactElement {
  const { documents, onClickItem, onShowAll } = props;

  const handleShowAll = (e: React.MouseEvent<HTMLAnchorElement>): void => {
    e.preventDefault();
    if (onShowAll) { onShowAll(); }
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>VĂN BẢN MỚI BAN HÀNH</h3>
        <a href="#" className={styles.cardLink} onClick={handleShowAll}>
          Xem tất cả
        </a>
      </div>

      {documents.length === 0 ? (
        <p className={styles.emptyState}>Không tìm thấy văn bản phù hợp.</p>
      ) : (
        <ul className={styles.docList}>
          {documents.map((doc: IDocument): React.ReactElement => {
            const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
              e.preventDefault();
              if (onClickItem) { onClickItem(doc); }
            };
            const docLabel: string = doc.nguoiKy
              ? `${doc.loaiVanBan} • ${doc.donViSoanThao} • ${doc.nguoiKy}`
              : `${doc.loaiVanBan} • ${doc.donViSoanThao}`;
            return (
              <li key={doc.id} className={styles.docItem}>
                <button
                  type="button"
                  onClick={handleClick}
                  className={`${styles.docLink} ${styles.docButton}`}
                  title="Click để xem chi tiết"
                >
                  <span className={styles.docFileIcon} aria-hidden={true}>
                    {doc.fileKind === 'pdf' ? <PdfFileIcon size={18} /> : <WordFileIcon size={18} />}
                  </span>
                  <span className={styles.docBody}>
                    <span className={styles.docName}>
                      {doc.soVanBan ? `${doc.soVanBan}-` : ''}{doc.trichYeu}
                    </span>
                    <span className={styles.docMeta}>{docLabel}</span>
                  </span>
                  <span className={styles.docDate}>{formatDate(doc.ngayBanHanh)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <a href="#" className={styles.cardFooterLink} onClick={handleShowAll}>
        <span>Xem toàn bộ văn bản mới</span>
        <ArrowRightIcon size={14} />
      </a>
    </section>
  );
}
