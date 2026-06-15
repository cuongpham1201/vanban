import type { MetadataRoute } from 'next';

/**
 * PWA Web App Manifest (Next.js App Router tự sinh /manifest.webmanifest và tự chèn
 * <link rel="manifest"> vào <head>). Cho phép "Add to Home Screen" / cài như app trên
 * mobile, chạy standalone (không thanh địa chỉ trình duyệt).
 *   theme_color = navy thương hiệu (--navy-700 #143f7e); background = nền app (#f5f5f5).
 *   start_url = /dashboard (màn hình mở khi khởi chạy từ icon home screen).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Quản lý văn bản Bia Hạ Long',
    short_name: 'Quản lý VB',
    description: 'Hệ thống Quản lý văn bản của Công ty CP Bia và Nước giải khát Hạ Long',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    lang: 'vi',
    dir: 'ltr',
    theme_color: '#143f7e',
    background_color: '#f5f5f5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
