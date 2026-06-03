'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IDocument } from '../models/IDocument';
import { formatDate, remainingLabel, daysUntil } from '../utils/format';
import { WarningIcon, ArrowRightIcon } from './Icons';

export interface IExpiringDocsCardProps {
  documents: IDocument[];
  onClickItem?: (doc: IDocument) => void;
  onShowAll?: () => void;
}

function expiryClass(days: number | undefined): string {
  if (days === undefined) { return ''; }
  if (days <= 7)  { return styles.expiryUrgent; }   // đỏ
  if (days <= 30) { return styles.expiryWarning; }  // vàng
  return styles.expirySafe;                          // xanh
}

export default function ExpiringDocsCard(props: IExpiringDocsCardProps): React.ReactElement {
  const { documents, onClickItem, onShowAll } = props;

  const handleShowAll = (e: React.MouseEvent<HTMLAnchorElement>): void => {
    e.preventDefault();
    if (onShowAll) { onShowAll(); }
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>VĂN BẢN SẮP HẾT HIỆU LỰC</h3>
        <a href="#" className={styles.cardLink} onClick={handleShowAll}>
          Xem tất cả
        </a>
      </div>

      {documents.length === 0 ? (
        <p className={styles.emptyState}>Không có văn bản nào sắp hết hiệu lực trong 60 ngày tới.</p>
      ) : (
        <ul className={styles.docList}>
          {documents.map((doc: IDocument): React.ReactElement => {
            const days: number | undefined = daysUntil(doc.ngayHetHieuLuc);
            const urgent: boolean = days !== undefined && days <= 15;
            const expCls: string = expiryClass(days);
            const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
              e.preventDefault();
              if (onClickItem) { onClickItem(doc); }
            };
            return (
              <li key={doc.id} className={styles.docItem}>
                <button
                  type="button"
                  onClick={handleClick}
                  className={`${styles.docLink} ${styles.docButton}`}
                  title="Click để xem chi tiết"
                >
                  <span className={`${styles.warnIcon} ${urgent ? styles.warnIconUrgent : ''}`} aria-hidden={true}>
                    <WarningIcon size={16} />
                  </span>
                  <span className={styles.docBody}>
                    <span className={styles.docName}>
                      {doc.soVanBan ? `${doc.soVanBan}-` : ''}{doc.trichYeu}
                    </span>
                    <span className={styles.docMeta}>
                      Hiệu lực đến: {formatDate(doc.ngayHetHieuLuc)}
                      <span className={`${styles.daysBadge} ${expCls}`}>
                        ({remainingLabel(doc.ngayHetHieuLuc)})
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <a href="#" className={styles.cardFooterLink} onClick={handleShowAll}>
        <span>Xem toàn bộ văn bản sắp hết hiệu lực</span>
        <ArrowRightIcon size={14} />
      </a>
    </section>
  );
}
