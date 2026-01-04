import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incomingId = req.header(REQUEST_ID_HEADER);
  const requestId = incomingId && incomingId.trim() ? incomingId : randomUUID();

  req.request_id = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
