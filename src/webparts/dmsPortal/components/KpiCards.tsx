import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IKpiStat, KpiKey } from '../models/IDocument';
import { formatNumber } from '../utils/format';
import {
  IIconProps,
  DocStackIcon,
  CheckCircleIcon,
  ClockAlertIcon,
  XCircleIcon,
  ClockIcon,
  DocLibraryIcon,
  WarningIcon,
  BuildingIcon,
  FileNewIcon
} from './Icons';

export interface IKpiCardsProps {
  kpis: IKpiStat[];
  onClickKpi?: (key: KpiKey) => void;
}

interface IKpiVisual {
  icon: (props: IIconProps) => React.ReactElement;
  /** Hex accent for value + icon. */
  accent: string;
  /** Soft background tint for the icon bubble. */
  tint: string;
}

const KPI_VISUALS: Record<KpiKey, IKpiVisual> = {
  total: { icon: DocStackIcon, accent: '#0038A8', tint: '#E6ECFA' },
  byUnit: { icon: BuildingIcon, accent: '#8764B8', tint: '#F0EAF8' },
  active: { icon: CheckCircleIcon, accent: '#107C41', tint: '#E2F2E8' },
  recent: { icon: FileNewIcon, accent: '#0A6CCA', tint: '#E1EFFB' },
  expiringSoon: { icon: ClockAlertIcon, accent: '#CA5010', tint: '#FBEBE1' },
  expired: { icon: XCircleIcon, accent: '#D13438', tint: '#FBE4E5' },
  needsReview: { icon: WarningIcon, accent: '#CA5010', tint: '#FBEBE1' },
  missingSource: { icon: WarningIcon, accent: '#B26A00', tint: '#FBF1DC' },
  hasSource: { icon: DocLibraryIcon, accent: '#107C41', tint: '#E2F2E8' },
  pending: { icon: ClockIcon, accent: '#B26A00', tint: '#FBF1DC' }
};

export default function KpiCards({ kpis, onClickKpi }: IKpiCardsProps): React.ReactElement {
  return (
    <div className={styles.kpiGrid}>
      {kpis.map((kpi: IKpiStat): React.ReactElement => {
        const visual: IKpiVisual = KPI_VISUALS[kpi.key];
        const Icon: (props: IIconProps) => React.ReactElement = visual.icon;
        const handleClick = (): void => { if (onClickKpi) { onClickKpi(kpi.key); } };
        return (
          <button
            key={kpi.key}
            type="button"
            className={`${styles.kpiCard} ${styles.kpiCardButton}`}
            onClick={handleClick}
            title="Click để xem danh sách"
          >
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>{kpi.label}</span>
              <span className={styles.kpiValue} style={{ color: visual.accent }}>
                {formatNumber(kpi.value)}
              </span>
              <span className={styles.kpiCaption}>{kpi.caption}</span>
            </div>
            <span
              className={styles.kpiIcon}
              style={{ color: visual.accent, backgroundColor: visual.tint }}
              aria-hidden={true}
            >
              <Icon size={18} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
