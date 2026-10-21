import { z } from 'zod';

export const ASSET_BUCKET = 'asl-assets';
export const PRIVATE_BUCKET = 'asl-private-media';
export const MAX_IMAGE_BYTES = 1_500_000;
// Legacy JSON input limit counts characters, independently of uploaded binary bytes.
export const MAX_IMAGE_DATA_URL_LENGTH = 1_500_000;
export const imageKind = z.enum(['account-image', 'team-logo', 'article-cover']);
export const imageContentType = z.enum(['image/png', 'image/jpeg', 'image/webp']);
export const imageUploadInput = z.strictObject({
    kind: imageKind, entityId: z.string().min(1).max(160), contentType: imageContentType,
});
export const imageUploadResponse = z.object({
    bucket: z.literal(PRIVATE_BUCKET), path: z.string().min(1), token: z.string().min(1), sourceUrl: z.url(),
});
export type ImageKind = z.infer<typeof imageKind>;
export type ImageContentType = z.infer<typeof imageContentType>;
export type ImageUploadResponse = z.infer<typeof imageUploadResponse>;
