/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Preview chỉ kiểm UI/UX — không chặn dev/build vì lỗi type/lint của code SPFx
  // (code viết cho React 17 + tsconfig SPFx; ở đây chạy SWC nên runtime vẫn OK).
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // @fluentui/react (v8) phát hành ESM/CJS lẫn lộn — transpile để Next bundle ổn định.
  transpilePackages: ['@fluentui/react', '@fluentui/font-icons-mdl2'],
};

export default nextConfig;
