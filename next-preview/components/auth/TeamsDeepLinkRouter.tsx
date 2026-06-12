'use client';

// A5 — Khi app mở trong Teams qua deep link (Activity notification), Teams load tab ở route mặc
// định (→ /dashboard) nhưng cấp subEntityId = "/documents/{id}?inTeams=1" qua launch context.
// Component này đọc subEntityId 1 lần rồi router.replace tới đúng văn bản. Ngoài Teams: no-op.
import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isInTeamsHostFast, getTeamsDeepLinkTarget } from '@/lib/teams/teamsClient';

const SS_KEY = 'bhl.teams.deeplink.done';

export default function TeamsDeepLinkRouter(): null {
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!isInTeamsHostFast()) {
      return;
    }
    // Chỉ điều hướng 1 lần / phiên launch → tránh kéo user về lại văn bản khi họ đã tự rời đi.
    let done = false;
    try {
      done = sessionStorage.getItem(SS_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (done) {
      return;
    }
    let alive = true;
    void getTeamsDeepLinkTarget().then((target) => {
      if (!alive || !target) {
        return;
      }
      try {
        sessionStorage.setItem(SS_KEY, '1');
      } catch {
        /* ignore */
      }
      const targetPath = target.split('?')[0];
      if (targetPath && targetPath !== pathname) {
        router.replace(target);
      }
    });
    return () => {
      alive = false;
    };
  }, [router, pathname]);

  return null;
}
