import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './Providers';

export const metadata: Metadata = {
  title: 'Quản lý văn bản',
  description: 'Hệ thống Quản lý văn bản của Công ty CP Bia và Nước giải khát Hạ Long',
  applicationName: 'Quản lý VB',
  appleWebApp: {
    capable: true,
    title: 'Quản lý VB',
    statusBarStyle: 'black-translucent',
  },
};

// viewport-fit=cover → cho phép dùng safe-area-inset (tai thỏ/notch iPhone).
// themeColor → màu thanh trạng thái khi cài PWA (navy thương hiệu --navy-700).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#143f7e',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
