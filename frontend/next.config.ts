import type { NextConfig } from 'next';

// 前端只负责路由与页面渲染，两类后端资源仍由独立 Express 进程处理。
const backendOrigin = (process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:3101').replace(/\/$/u, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backendOrigin}/api/:path*` },
      { source: '/media/:path*', destination: `${backendOrigin}/media/:path*` },
    ];
  },
};

export default nextConfig;
