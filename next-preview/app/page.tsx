import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

// Root "/" KHÔNG còn render trang chủ cũ (legacy SPA). Điều hướng read-only:
//   - Đã đăng nhập  → /dashboard
//   - Chưa đăng nhập → /signin
// Middleware cũng bảo vệ "/"; đây là tầng điều hướng dứt khoát, không load data nặng.
export const dynamic = 'force-dynamic';

export default async function RootPage(): Promise<never> {
  const session = await getServerSession(authOptions);
  redirect(session ? '/dashboard' : '/signin');
}
