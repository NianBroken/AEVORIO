import type { Response } from 'express';
import type { ApiEnvelope } from '../types/site';

export function sendSuccess<T>(
  response: Response,
  requestId: string,
  message: string,
  data: T,
): void {
  response.status(200).json(buildEnvelope(0, requestId, message, data));
}

export function sendFailure(
  response: Response,
  requestId: string,
  httpStatus: number,
  code: number,
  message: string,
): void {
  response.status(httpStatus).json(buildEnvelope(code, requestId, message, null));
}

function buildEnvelope<T>(
  code: number,
  requestId: string,
  message: string,
  data: T | null,
): ApiEnvelope<T> {
  return {
    Code: code,
    Messages: message,
    Data: data,
    RequestId: requestId,
    Timestamp: new Date().toISOString(),
  };
}
