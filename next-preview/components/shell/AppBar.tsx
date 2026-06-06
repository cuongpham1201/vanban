'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Icon from './Icon';

// Thanh trên cùng (appbar). Global search là input thật (id="global-search"):
//  - Ctrl/Cmd+K focus vào nó (xem GlobalShortcuts) khi không ở /search.
//  - Enter → điều hướng sang /search?q=… ; khi ĐANG ở /search, mirror URL q để 2 ô search
//    (header + Search Center) KHÔNG lệch nhau (BUG#1).
export default function AppBar(): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onSearchPage = pathname === '/search';
  const urlQ = searchParams.get('q') ?? '';
  const [q, setQ] = React.useState('');

  // Khi ở /search: đồng bộ input header theo URL q (Search Center cập nhật URL → header theo).
  React.useEffect(() => {
    if (onSearchPage) {
      setQ(urlQ);
    }
  }, [onSearchPage, urlQ]);

  const submit = (): void => {
    const term = q.trim();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  };

  return (
    <header className="appbar">
      <div className="logo">
        <span className="mark" />
        <span>BHL <span style={{ fontWeight: 500, opacity: 0.85 }}>- Văn bản điều hành</span></span>
      </div>
      <div className="spacer" />
      <div className="gsearch" role="search">
        <Icon name="search" size={18} />
        <input
          id="global-search"
          type="search"
          aria-label="Tìm văn bản"
          placeholder="Tìm văn bản, số VB, người ký…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <span className="kbd">Ctrl K</span>
      </div>
      <div className="spacer" />
      <div className="iconbtn" title="Tải lên" onClick={() => router.push('/upload')} role="button" tabIndex={0}>
        <Icon name="upload" />
      </div>
      <div className="iconbtn" title="Thông báo" style={{ position: 'relative' }}>
        <Icon name="bell" />
        <span
          style={{
            position: 'absolute', top: 6, right: 7, width: 7, height: 7, borderRadius: '50%',
            background: 'var(--gold-500)', border: '1.5px solid var(--navy-700)',
          }}
        />
      </div>
      <div className="iconbtn" title="Trợ giúp">
        <Icon name="help" />
      </div>
      <div className="avatar" title="Người dùng">
        NL
      </div>
    </header>
  );
}
