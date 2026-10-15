import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

export const params = (request: FastifyRequest) => z.record(z.string(), z.string()).parse(request.params);
export const query = (request: FastifyRequest) => z.record(z.string(), z.string()).parse(request.query);
