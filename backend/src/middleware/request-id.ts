import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

// 使用服务端生成的请求标识，避免从未校验的客户端标头注入日志关联信息。
export const addRequestId: RequestHandler = (request, response, next) => {
  const requestId = randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
};
