import path from 'path';
import { fileURLToPath } from 'url';

// Thư mục chứa next.config.mjs (= root của Next app) — ổn định trên mọi OS.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Preview chỉ kiểm UI/UX — không chặn dev/build vì lỗi type/lint.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // @fluentui/react (v8) phát hành ESM/CJS lẫn lộn — transpile để Next bundle ổn định.
  transpilePackages: ['@fluentui/react', '@fluentui/font-icons-mdl2'],
  // Khai báo alias TƯỜNG MINH ở webpack để build deterministic trên Linux (Ubuntu),
  // không phụ thuộc cách Next suy ra baseUrl từ tsconfig "paths".
  //   @       -> <app root>
  //   @dms    -> <app root>/dms
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@dms': path.join(__dirname, 'dms'),
      '@': __dirname,
    };
    return config;
  },
};

export default nextConfig;
