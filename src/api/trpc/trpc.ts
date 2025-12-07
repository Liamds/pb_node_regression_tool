/**
 * tRPC initialization
 */

import { initTRPC } from '@trpc/server';
import type { Context } from './context.js';
import { logger } from '../../logger.js';

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    logger.error('tRPC error', {
      code: error.code,
      message: error.message,
      cause: error.cause,
    });
    return {
      ...shape,
      data: {
        ...shape.data,
        code: error.code,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

