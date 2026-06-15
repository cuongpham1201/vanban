'use client';

// A5/Teams deep link — Khi app mở trong Teams qua Activity notification, Teams nạp tab và cấp
// subEntityId = "/documents/{id}?inTeams=1" qua launch context (v2: context.page.subPageId).
// Component đọc target rồi router.replace tới đúng văn bản. Ngoài Teams: no-op.
//
// FIX (bug "click Activity lần 2 chỉ mở /dashboard", cả desktop lẫn mobile):
//   Bản cũ dùng guard sessionStorage once-only (`bhl.teams.deeplink.done`). Guard này chặn MỌI
//   điều hướng sau lần đầu TRONG CÙNG phiên Teams (sessionStorage sống qua các lần reload iframe)
//   → click Activity thứ 2 (văn bản khác) bị chặn → rơi về route mặc định /dashboard.
//   Thay bằng:
//     1) Đọc target ở MOUNT — mỗi click deep link ở tab chưa cache đều reload iframe → remount.
//     2) Đọc lại khi tab focus / visible trở lại — Teams resume tab đã cache (mobile hay gặp).
//     3) DEDUP bằng ref `lastHandled`: đã điều hướng tới target nào thì KHÔNG kéo user về lại
//        target đó nữa (tránh "yank-back" khi user tự rời đi). Target MỚI vẫn điều hướng.
//   ⇒ Mỗi lần click Activity đều mở đúng văn bản; KHÔNG fallback /dashboard khi đã có target.
import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isInTeamsHostFast, getTeamsDeepLinkTarget } from '@/lib/teams/teamsClient';

export default function TeamsDeepLinkRouter(): null {
  const router = useRouter();
  const pathname = usePathname();
  // Ref pathname để handler đọc path hiện tại mà không cần re-subscribe listener mỗi lần đổi route.
  const pathnameRef = React.useRef(pathname);
  pathnameRef.current = pathname;
  // Target đã xử lý gần nhất — chống điều hướng lặp lại / kéo user về chỗ cũ.
  const lastHandledRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!isInTeamsHostFast()) {
      return;
    }
    let alive = true;

    const handle = (target: string | undefined): void => {
      if (!alive || !target) {
        return;
      }
      // Đã xử lý đúng target này rồi → bỏ qua (user có thể đã tự điều hướng sang chỗ khác).
      if (lastHandledRef.current === target) {
        return;
      }
      lastHandledRef.current = target;
      const targetPath = target.split('?')[0];
      // Chỉ replace khi chưa ở đúng path → tránh điều hướng thừa, KHÔNG fallback /dashboard.
      if (targetPath && targetPath !== pathnameRef.current) {
        router.replace(target);
      }
    };

    const check = (): void => {
      void getTeamsDeepLinkTarget().then(handle);
    };

    // 1) Mount: mỗi click deep link (tab chưa cache) reload iframe → component remount → đọc context.
    check();

    // 2) Resume: Teams cache tab → khi tab visible/focus trở lại, đọc lại context (subPageId mới).
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        check();
      }
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  return null;
}
