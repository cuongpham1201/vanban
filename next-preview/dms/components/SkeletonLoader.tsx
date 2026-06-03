'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';

/**
 * Skeleton placeholders cho dashboard khi đang tải data.
 * - 3 card placeholders cho cards grid
 * - 5 KPI tile placeholders
 */

function CardSkeleton(): React.ReactElement {
  return (
    <div className={`${styles.card} ${styles.skeletonCard}`}>
      <div className={`${styles.skeletonBox} ${styles.skeletonTitle}`} />
      <div className={`${styles.skeletonBox} ${styles.skeletonLine}`} />
      <div className={`${styles.skeletonBox} ${styles.skeletonLine}`} />
      <div className={`${styles.skeletonBox} ${styles.skeletonLine}`} />
      <div className={`${styles.skeletonBox} ${styles.skeletonLine}`} />
      <div className={`${styles.skeletonBox} ${styles.skeletonLineShort}`} />
    </div>
  );
}

function KpiSkeleton(): React.ReactElement {
  return (
    <div className={`${styles.kpiCard} ${styles.skeletonKpi}`}>
      <div>
        <div className={`${styles.skeletonBox} ${styles.skeletonKpiLabel}`} />
        <div className={`${styles.skeletonBox} ${styles.skeletonKpiValue}`} />
      </div>
      <div className={`${styles.skeletonBox} ${styles.skeletonKpiIcon}`} />
    </div>
  );
}

export default function SkeletonLoader(): React.ReactElement {
  return (
    <>
      <div className={styles.cardsGrid}>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className={styles.kpiGrid}>
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
      </div>
    </>
  );
}
