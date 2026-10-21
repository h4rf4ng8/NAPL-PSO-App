import type { GraphQLOperationName } from '@napl/contracts';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { GatewayError } from './auth/errors.js';

declare module 'fastify' {
    interface FastifyRequest { operationName: GraphQLOperationName | null; awsLambda?: { event?: APIGatewayProxyEventV2 }; }
}

export const params = (request: FastifyRequest) => z.record(z.string(), z.string()).parse(request.params);
export const query = (request: FastifyRequest) => z.record(z.string(), z.string()).parse(request.query);

// The adapter supplies the event directly; forwarding headers are client-controlled.
export function clientIp(request: FastifyRequest): string {
    const event = request.awsLambda?.event;
    if (event) {
        const ip = event.requestContext?.http?.sourceIp;
        if (!ip) throw new GatewayError(400, 'missing_client_ip');
        return ip;
    }
    return request.socket.remoteAddress ?? request.ip;
}
