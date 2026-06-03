import * as React from 'react';
import SignInClient from './SignInClient';

// Trang đăng nhập tùy biến (thay /api/auth/signin mặc định). Dynamic vì đọc query (?error, ?callbackUrl).
export const dynamic = 'force-dynamic';

export default function SignInPage(): React.ReactElement {
  return (
    <React.Suspense fallback={null}>
      <SignInClient />
    </React.Suspense>
  );
}
