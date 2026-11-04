import ports from "../shared/ports.json";
import type { NextConfig } from 'next';
import path from 'node:path';

// 前端只负责路由与页面渲染，两类后端资源仍由独立 Express 进程处理。
const backendOrigin = (
  process.env.BACKEND_ORIGIN ?? `http://127.0.0.1:${ports.backend}`
).replace(/\/$/u, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: path.resolve(process.cwd(), '..') },
  outputFileTracingRoot: path.resolve(process.cwd(), '..'),
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backendOrigin}/api/:path*` },
      { source: '/media/:path*', destination: `${backendOrigin}/media/:path*` },
    ];
  },
};

export default nextConfig;
