'use client';

import * as React from 'react';
import Icon, { IconName } from '@/components/shell/Icon';
import FilterManagerTab from './FilterManagerTab';
import MetadataTab from './MetadataTab';
import CatalogTab from './CatalogTab';

// Admin Center V2 — port pixel từ Admin.html (.submenu + .admin-main + .apane).
// 3 tab theo spec: Bộ lọc tìm kiếm · Cấu hình Metadata · Danh mục. UI ONLY (mock state).
type PaneKey = 'filters' | 'meta' | 'catalog';

const MENU: { key: PaneKey; label: string; icon: IconName }[] = [
  { key: 'filters', label: 'Bộ lọc tìm kiếm', icon: 'filter' },
  { key: 'meta', label: 'Cấu hình Metadata', icon: 'admin' },
  { key: 'catalog', label: 'Danh mục', icon: 'docs' },
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
      </main>
    </div>
  );
}
