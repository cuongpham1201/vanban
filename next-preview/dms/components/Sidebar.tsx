'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { LOGO_BIA_HALONG } from '../assets/logoBiaHaLong';
import { NavKey } from '../models/IDocument';
import { DocGroupKey, IDocGroup } from '../utils/documentTypeGroups';
import {
  IIconProps,
  HomeIcon,
  SearchIcon,
  UploadIcon,
  BookIcon,
  TeamsIcon,
  StarIcon,
  BuildingIcon,
  SendIcon,
  GavelIcon,
  ClockAlertIcon,
  GridIcon,
  FlowIcon,
  TrashIcon
} from './Icons';

export interface ISidebarProps {
  activeKey: NavKey;
  onSelect: (key: NavKey) => void;
  /** 7 nhóm loại văn bản (DOC_GROUPS) hiển thị trên đầu sidebar. */
  groups: IDocGroup[];
  groupCounts: { [key: string]: number };
  activeGroup?: DocGroupKey;
  onGroupSelect: (key: DocGroupKey) => void;
}

interface INavItem { key: NavKey; label: string; icon: (props: IIconProps) => React.ReactElement; }

// Điều hướng chính — hiển thị trên cùng, phía trên nhóm loại văn bản.
const PRIMARY_ITEMS: INavItem[] = [
  { key: 'home', label: 'Trang chủ', icon: HomeIcon },
  { key: 'search', label: 'Tra cứu văn bản', icon: SearchIcon },
  { key: 'upload', label: 'Upload văn bản mới', icon: UploadIcon },
  { key: 'review', label: 'Cần chuẩn hóa', icon: ClockAlertIcon }
];

// Tiện ích khác (theo mockup).
const UTIL_ITEMS: INavItem[] = [
  { key: 'help', label: 'Hướng dẫn sử dụng', icon: BookIcon },
  { key: 'favorites', label: 'Yêu thích', icon: StarIcon },
  { key: 'following', label: 'Văn bản đang theo dõi', icon: FlowIcon },
  { key: 'trash', label: 'Thùng rác', icon: TrashIcon }
];

const GROUP_ICONS: { [name: string]: (props: IIconProps) => React.ReactElement } = {
  StarIcon, BookIcon, BuildingIcon, SendIcon, GavelIcon, ClockAlertIcon, GridIcon
};

export default function Sidebar(props: ISidebarProps): React.ReactElement {
  const { activeKey, onSelect, groups, groupCounts, activeGroup, onGroupSelect } = props;

  const renderNavItem = (item: INavItem): React.ReactElement => {
    const Icon: (props: IIconProps) => React.ReactElement = item.icon;
    const isActive: boolean = activeKey === item.key;
    return (
      <button
        key={item.key}
        type="button"
        title={item.label}
        className={`${styles.navItem} ${styles.navItemButton} ${isActive ? styles.navItemActive : ''}`}
        onClick={(): void => onSelect(item.key)}
      >
        <Icon size={16} className={styles.navIcon} />
        <span className={styles.navItemText}>{item.label}</span>
      </button>
    );
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <img className={styles.brandImg} src={LOGO_BIA_HALONG} alt="Bia Hạ Long - Thương hiệu Quốc gia Việt Nam" />
      </div>

      {/* Điều hướng chính */}
      <nav className={styles.nav}>
        {PRIMARY_ITEMS.map(renderNavItem)}
      </nav>

      {/* Nhóm loại văn bản (quick filter dạng list dọc) */}
      <div className={styles.navSectionLabel}>NHÓM LOẠI VĂN BẢN</div>
      <nav className={styles.nav}>
        {groups.map((g: IDocGroup): React.ReactElement => {
          const Icon: (props: IIconProps) => React.ReactElement = GROUP_ICONS[g.icon] ?? GridIcon;
          const isActive: boolean = activeGroup === g.key;
          const count: number = groupCounts[g.key] ?? 0;
          return (
            <button
              key={g.key}
              type="button"
              title={g.label}
              className={`${styles.navItem} ${styles.navItemButton} ${isActive ? styles.navItemActive : ''}`}
              onClick={(): void => onGroupSelect(g.key)}
            >
              <Icon size={16} className={styles.navIcon} />
              <span className={styles.navItemText}>{g.label}</span>
              <span className={styles.navCount}>{count}</span>
            </button>
          );
        })}
      </nav>

      {/* Tiện ích */}
      <div className={styles.navSectionLabel}>TIỆN ÍCH KHÁC</div>
      <nav className={styles.nav}>
        {UTIL_ITEMS.map(renderNavItem)}
      </nav>

      <a href="https://teams.microsoft.com" target="_blank" rel="noopener noreferrer" className={styles.backToTeams}>
        <TeamsIcon size={20} />
        <span>Quay lại Microsoft Teams</span>
      </a>
    </aside>
  );
}
