import type { GraphQLOperationName } from '@napl/contracts';
import type { FastifyRequest } from 'fastify';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { GatewayError } from './auth/errors.js';

declare module 'fastify' {
    interface FastifyRequest { operationName: GraphQLOperationName | null; viewerIp: string | null; awsLambda?: { event?: APIGatewayProxyEventV2 }; }
}

export const params = (request: FastifyRequest) => z.record(z.string(), z.string()).parse(request.params);
export const query = (request: FastifyRequest) => z.record(z.string(), z.string()).parse(request.query);

export function cloudFrontIp(request: FastifyRequest): string {
    if (!request.awsLambda?.event) throw new GatewayError(400, 'missing_client_ip');
    const ip = request.headers['x-napl-client-ip'];
    if (ip === undefined) throw new GatewayError(400, 'missing_client_ip');
    if (typeof ip !== 'string' || !isIP(ip)) throw new GatewayError(400, 'invalid_client_ip');
    return ip;
}

// The adapter supplies the event directly; forwarding headers are client-controlled.
export function clientIp(request: FastifyRequest): string {
    if (request.viewerIp) return request.viewerIp;
    const event = request.awsLambda?.event;
    if (event) {
        const ip = event.requestContext?.http?.sourceIp;
        if (!ip) throw new GatewayError(400, 'missing_client_ip');
        return ip;
    }
    return request.socket.remoteAddress ?? request.ip;
}
