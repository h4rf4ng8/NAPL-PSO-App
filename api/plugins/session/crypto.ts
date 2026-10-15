import { createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CompactEncrypt, compactDecrypt, decodeProtectedHeader } from 'jose';
import { z } from 'zod';
import { GatewayError } from '../auth/errors.js';

const keysSchema = z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/), z.string());
const purposes = ['session', 'login', 'refresh-result'] as const;
type Purpose = (typeof purposes)[number];
const cookieLimit = (purpose: string) => purpose === 'refresh-result' ? 16_384 : 3700;

export class CookieCrypto {
  private readonly keys: Map<string, Buffer>;
  private readonly active: string;

  constructor(encodedKeys: string) {
    const keys = keysSchema.parse(JSON.parse(encodedKeys) as unknown);
    this.keys = new Map(Object.entries(keys).map(([id, encoded]) => {
      const key = Buffer.from(encoded, 'base64');
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) || key.length !== 32 || key.toString('base64') !== encoded) {
        throw new Error('Cookie keys must contain 32 random bytes encoded as base64');
      }
      return [id, key];
    }));
    const active = this.keys.keys().next().value;
    if (!active) throw new Error('At least one cookie encryption key is required');
    this.active = active;
  }

  async seal(purpose: Purpose, value: unknown): Promise<string> {
    if (!purposes.includes(purpose)) throw new TypeError('Invalid cookie purpose');
    const protectedHeader = { alg: 'dir', enc: 'A256GCM', kid: this.active, purpose, version: 2 };
    const jwe = await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(value)))
      .setProtectedHeader(protectedHeader)
      .encrypt(this.key(this.active));
    const cookie = `2.${jwe}`;
    if (cookie.length > cookieLimit(purpose)) throw new GatewayError(503, 'session_cookie_too_large');
    return cookie;
  }

  async open<T>(purpose: Purpose, cookie: string | undefined, schema: z.ZodType<T>): Promise<T> {
    try {
      if (!cookie || !purposes.includes(purpose) || cookie.length > cookieLimit(purpose)) throw new Error('Invalid encrypted cookie length');
      if (cookie.startsWith('2.')) {
        const compact = cookie.slice(2);
        const untrusted = decodeProtectedHeader(compact);
        if (typeof untrusted.kid !== 'string') throw new TypeError('Missing cookie key id');
        const { plaintext, protectedHeader } = await compactDecrypt(compact, this.key(untrusted.kid), {
          keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'],
        });
        if (protectedHeader.alg !== 'dir' || protectedHeader.enc !== 'A256GCM' || protectedHeader.kid !== untrusted.kid || protectedHeader.version !== 2 || protectedHeader.purpose !== purpose) {
          throw new Error('Invalid encrypted cookie purpose');
        }
        return schema.parse(JSON.parse(new TextDecoder().decode(plaintext)) as unknown);
      }
      // shortcut: v1 reads only; remove 30 days after final v1 issuance.
      return this.openLegacy(purpose, cookie, schema);
    } catch {
      throw new GatewayError(401, 'session_invalid');
    }
  }

  csrf(binding: string, now = Date.now()): string {
    const message = `${this.active}.${Math.floor(now / 1000) + 3600}.${randomBytes(24).toString('base64url')}.${binding}`;
    return `${message}.${this.mac(this.active, message)}`;
  }

  verifyCsrf(token: string | undefined, cookie: string | undefined, binding: string, now = Date.now()): boolean {
    if (!token || !cookie || token !== cookie || token.length > 256) return false;
    const [key, expiry, nonce, embeddedBinding, signature, extra] = token.split('.', 6);
    if (!key || !expiry || !nonce || embeddedBinding !== binding || !signature || extra || !Number.isFinite(Number(expiry)) || Number(expiry) <= now / 1000) return false;
    try {
      const actual = Buffer.from(signature);
      const expected = Buffer.from(this.mac(key, `${key}.${expiry}.${nonce}.${embeddedBinding}`));
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  verifyLogoutCsrf(token: string | undefined, cookie: string | undefined): boolean {
    const binding = token?.split('.', 4)[3];
    return !!binding && this.verifyCsrf(token, cookie, binding);
  }

  private openLegacy<T>(purpose: Purpose, cookie: string, schema: z.ZodType<T>): T {
    const [version, id, iv, ciphertext, tag, extra] = cookie.split('.', 6);
    if (version !== '1' || !id || !iv || !ciphertext || !tag || extra) throw new Error('Invalid encrypted cookie envelope');
    const nonce = Buffer.from(iv, 'base64url');
    const authTag = Buffer.from(tag, 'base64url');
    if (nonce.length !== 12 || authTag.length !== 16) throw new Error('Invalid encrypted cookie envelope');
    const decipher = createDecipheriv('aes-256-gcm', this.key(id), nonce);
    decipher.setAAD(Buffer.from(`napl:1:${purpose}:${id}`));
    decipher.setAuthTag(authTag);
    return schema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString()) as unknown);
  }

  private mac(id: string, message: string) {
    return createHmac('sha256', this.key(id)).update(`napl:csrf:${message}`).digest('base64url');
  }

  private key(id: string): Buffer {
    const key = this.keys.get(id);
    if (!key) throw new Error('Unknown cookie key');
    return key;
  }
}
