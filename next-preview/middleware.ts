import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// Bảo vệ route trang DMS — yêu cầu session hợp lệ (reuse pattern Approval BHL).
//  - Chưa đăng nhập → redirect /signin.
//  - Defense-in-depth: session có email ngoài @<domain> → /unauthorized + xóa cookie.
//  - KHÔNG chặn /api/* (các API tự bảo vệ bằng getServerSession → trả 401 JSON),
//    /api/auth/*, _next/*, /signin, /unauthorized, favicon.
//  - Mock mode (NEXT_PUBLIC_DMS_DATA_SOURCE !== 'graph') → bỏ qua auth cho dev local.
const ALLOWED_DOMAIN = '@' + ((process.env.ALLOWED_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'biahalong.com');
// Inlined tại build: chỉ bật bảo vệ khi chạy graph mode (production). Mặc định = bảo vệ.
const IS_MOCK = process.env.NEXT_PUBLIC_DMS_DATA_SOURCE === 'mock';

export default withAuth(
  function middleware(req) {
    const email = (req.nextauth.token?.email as string | undefined)?.toLowerCase().trim() ?? '';
    if (email && !email.endsWith(ALLOWED_DOMAIN)) {
      const res = NextResponse.redirect(new URL('/unauthorized', req.url));
      const gone = { path: '/', expires: new Date(0) };
      res.cookies.set('next-auth.session-token', '', gone);
      res.cookies.set('__Secure-next-auth.session-token', '', { ...gone, secure: true });
      return res;
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      // Mock mode → luôn cho qua (dev). Graph mode → bắt buộc có token (nếu không → redirect signIn).
      authorized: ({ token }) => IS_MOCK || !!token,
    },
    pages: { signIn: '/signin' },
  }
);

// Chỉ match route TRANG (không match /api/*). Trang chủ '/' là SPA chính của DMS;
// liệt kê thêm các route tương lai để forward-compatible.
export const config = {
  matcher: ['/', '/tra-cuu/:path*', '/upload/:path*', '/chuan-hoa/:path*', '/yeu-thich/:path*'],
};
