'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IUnitStat } from '../models/IDocument';
import { formatNumber } from '../utils/format';
import { BuildingIcon } from './Icons';

export interface IByUnitCardProps {
  units: IUnitStat[];
  onClickUnit?: (unitCode: string, unitName: string) => void;
}

export default function ByUnitCard(props: IByUnitCardProps): React.ReactElement {
  const { units, onClickUnit } = props;

  // Hiển thị ĐẦY ĐỦ tất cả cấp lưu trữ (folder), KHÔNG giới hạn top, KHÔNG sort theo
  // số lượng. Thứ tự sort theo TÊN FOLDER do service quyết định ([00], [01]... [99]).
  // Danh sách dài → cho phép cuộn trong khung cố định.
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>
          VĂN BẢN THEO CẤP LƯU TRỮ
          <span
            className={styles.titleHint}
            title="Phân bố theo Cấp lưu trữ (folder cấp 1 [NN]), sắp theo tên folder. Không tính văn bản hết hiệu lực."
            aria-label="Giải thích"
          >
            ⓘ
          </span>
        </h3>
        <span className={styles.cardLink} title="Tổng số cấp lưu trữ">{formatNumber(units.length)} cấp</span>
      </div>

      <ul className={styles.unitList}>
        {units.map((unit: IUnitStat): React.ReactElement => {
          const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
            e.preventDefault();
            if (onClickUnit) { onClickUnit(unit.code, unit.name); }
          };
          return (
            <li key={unit.code} className={styles.unitItem}>
              <button
                type="button"
                onClick={handleClick}
                className={styles.unitButton}
                title={`Xem văn bản của ${unit.name}`}
              >
                <span className={styles.unitIcon} style={{ color: unit.color, backgroundColor: `${unit.color}1A` }} aria-hidden={true}>
                  <BuildingIcon size={16} />
                </span>
                <span className={styles.unitName}>{unit.name}</span>
                <span className={styles.unitCount}>{formatNumber(unit.count)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
