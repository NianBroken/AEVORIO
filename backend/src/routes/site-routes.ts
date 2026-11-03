import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { SiteService } from '../services/site-service';
import { SiteReadError } from '../services/site-service';
import type { PageSlug } from '../types/site';
import { sendFailure, sendSuccess } from '../utils/response';

const validPages = new Set<PageSlug>(['home', 'products', 'about']);

export function createSiteRouter(service: SiteService): Router {
  const router = Router();

  // Express 自动支持的 HEAD 也经过明确的方法白名单，业务契约始终只有 GET。
  router.all('/api/v1/site', (request, response, next) => {
    if (request.method === 'GET') { next(); return; }
    response.setHeader('Allow', 'GET');
    sendFailure(response, response.locals.requestId as string, 405, 1003,
      '请求失败：此业务接口仅支持 GET 方法，请以 GET 方法重新请求。');
  });

  router.get('/api/v1/site', async (request, response) => {
    const requestId = response.locals.requestId as string;
    const rawPage = request.query.page;

    if (typeof rawPage !== 'string' || !validPages.has(rawPage as PageSlug)) {
      sendFailure(
        response,
        requestId,
        400,
        1001,
        '页面数据读取失败：请求参数 page 缺失或取值不合法，仅支持 home、products 和 about 三种页面标识。',
      );
      return;
    }

    if (Object.keys(request.query).some((key) => key !== 'page')) {
      sendFailure(
        response,
        requestId,
        400,
        1001,
        '页面数据读取失败：接口不接受 page 以外的查询参数，请删除无关参数后重新提交。',
      );
      return;
    }

    try {
      const page = await service.loadPage(rawPage as PageSlug);
      sendSuccess(
        response,
        requestId,
        `已成功加载${page.page.title}页面。本次请求读取了已配置的页面板块、产品分类及其本地媒体信息，可用于完整渲染当前页面。`,
        page,
      );
    } catch (error) {
      const safeError = error instanceof SiteReadError ? error : undefined;
      sendFailure(
        response,
        requestId,
        500,
        safeError?.code ?? 9000,
        safeError?.message ?? '页面数据读取失败：服务端遇到未预期的问题，请检查后端日志并稍后重试。',
      );
    }
  });

  return router;
}

export function createApiNotFound(): RequestHandler {
  return (request, response) => {
    sendFailure(
      response,
      response.locals.requestId as string,
      404,
      1002,
      `请求失败：接口 ${request.path} 不存在，请检查路径后重新请求。`,
    );
  };
}
