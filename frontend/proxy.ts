import { NextResponse, type NextRequest } from 'next/server';

const CONTENT_PATHS = new Set(['/', '/products', '/about']);
const RESOURCE_PREFIXES = ['/api', '/media', '/_next', '/admin'];

// 未知内容路径在页面渲染之前直接重定向，保持三个正式页面及正常资源请求。
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isResource = RESOURCE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (CONTENT_PATHS.has(pathname) || isResource || pathname === '/icon.svg' || pathname === '/favicon.ico') {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL('/', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
