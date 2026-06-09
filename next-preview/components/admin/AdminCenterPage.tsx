'use client';

import * as React from 'react';
import Icon, { IconName } from '@/components/shell/Icon';
import FilterManagerTab from './FilterManagerTab';
import MetadataTab from './MetadataTab';
import CatalogTab from './CatalogTab';
import SystemTab from './SystemTab';

// Admin Center V2 — port pixel từ Admin.html (.submenu + .admin-main + .apane).
// Tab: Bộ lọc tìm kiếm · Cấu hình Metadata · Danh mục · Hệ thống.
type PaneKey = 'filters' | 'meta' | 'catalog' | 'system';

const MENU: { key: PaneKey; label: string; icon: IconName }[] = [
  { key: 'filters', label: 'Bộ lọc tìm kiếm', icon: 'filter' },
  { key: 'meta', label: 'Cấu hình Metadata', icon: 'admin' },
  { key: 'catalog', label: 'Danh mục', icon: 'docs' },
  { key: 'system', label: 'Hệ thống', icon: 'settings' },
];

export default function AdminCenterPage(): React.ReactElement {
  const [pane, setPane] = React.useState<PaneKey>('filters');

  return (
    <div className="adm-root">
      <nav className="adm-submenu scrollbar">
        <div className="ttl">Quản trị hệ thống</div>
        {MENU.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`adm-si${pane === m.key ? ' on' : ''}`}
            onClick={() => setPane(m.key)}
            aria-current={pane === m.key ? 'page' : undefined}
          >
            <Icon name={m.icon} />
            <span>{m.label}</span>
          </button>
        ))}
      </nav>

      <main className="adm-main scrollbar">
        {pane === 'filters' && <FilterManagerTab />}
        {pane === 'meta' && <MetadataTab />}
        {pane === 'catalog' && <CatalogTab />}
        {pane === 'system' && <SystemTab />}
      </main>
    </div>
  );
}
