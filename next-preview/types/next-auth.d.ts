import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: string;
    teams?: boolean; // #31G — phiên đăng nhập qua Teams SSO (không có Graph token delegated)
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number; // epoch seconds
    error?: string;
    teams?: boolean; // #31 — phiên đăng nhập qua Teams SSO (session nhẹ, không Graph token delegated)
  }
}
