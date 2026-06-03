'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { SearchIcon, ChevronDownIcon } from './Icons';
import { APP_VERSION } from '../version';

export interface IHeroProps {
  searchTerm: string;
  isAdvancedSearchOpen: boolean;
  onSearchTermChange: (value: string) => void;
  onSearchSubmit: () => void;
  onToggleAdvanced: () => void;
}

export default function Hero(props: IHeroProps): React.ReactElement {
  const { searchTerm, isAdvancedSearchOpen, onSearchTermChange, onSearchSubmit, onToggleAdvanced } = props;

  const [localTerm, setLocalTerm] = React.useState<string>(searchTerm);

  React.useEffect((): void => { setLocalTerm(searchTerm); }, [searchTerm]);

  React.useEffect((): (() => void) | undefined => {
    if (localTerm === searchTerm) { return undefined; }
    const handle: number = window.setTimeout((): void => {
      onSearchTermChange(localTerm);
      if (localTerm.trim() !== '') { onSearchSubmit(); }
    }, 300);
    return (): void => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTerm]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') { onSearchTermChange(localTerm); onSearchSubmit(); }
  };

  return (
    <section className={styles.hero}>
      <span className={styles.heroVersion} title="Phiên bản ứng dụng">v{APP_VERSION}</span>
      <div className={styles.heroArt} aria-hidden={true}>
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMax meet" width="100%" height="100%">
          <g fill="#ffffff" opacity="0.12">
            <rect x="20" y="70" width="60" height="130" />
            <rect x="95" y="40" width="70" height="160" />
            <rect x="180" y="20" width="55" height="180" />
            <rect x="248" y="90" width="55" height="110" />
          </g>
        </svg>
      </div>

      <div className={styles.heroContent}>
        <h2 className={styles.heroTitle}>HỆ THỐNG QUẢN LÝ VĂN BẢN ĐIỀU HÀNH</h2>
        <div className={styles.heroSearchRow}>
          <div className={styles.searchBox}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Tìm kiếm văn bản, số hiệu, loại văn bản, người ký, đơn vị..."
              value={localTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setLocalTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Tìm kiếm văn bản"
            />
            {localTerm && (
              <button
                type="button"
                className={styles.searchClearButton}
                onClick={(): void => { setLocalTerm(''); onSearchTermChange(''); }}
                aria-label="Xóa từ khóa"
                title="Xóa từ khóa"
              >
                ×
              </button>
            )}
            <button
              type="button"
              className={styles.searchButton}
              onClick={(): void => { onSearchTermChange(localTerm); onSearchSubmit(); }}
              aria-label="Tìm kiếm"
            >
              <SearchIcon size={20} />
            </button>
          </div>
          <button
            type="button"
            className={`${styles.advancedToggle} ${isAdvancedSearchOpen ? styles.advancedToggleActive : ''}`}
            onClick={onToggleAdvanced}
            aria-expanded={isAdvancedSearchOpen}
          >
            <span>Tìm kiếm nâng cao</span>
            <span className={`${styles.advancedChevron} ${isAdvancedSearchOpen ? styles.advancedChevronUp : ''}`}>
              <ChevronDownIcon size={16} />
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
