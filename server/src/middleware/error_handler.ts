import { NextFunction, Request, Response } from 'express';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const message = err instanceof Error ? err.message : 'internal_server_error';

  res.status(500).json({
    message,
    request_id: req.request_id
  });
}
