import { z } from 'zod';
import { supabase, sessionVersion } from '../auth/client';
import { request } from './http';

const uploadSchema = z.object({ bucket: z.literal('asl-private-media'), path: z.string().min(1), token: z.string().min(1), sourceUrl: z.url() });

export async function uploadImage(kind: 'account-image' | 'team-logo' | 'article-cover', entityId: string, preview: string): Promise<string> {
  if (!preview.startsWith('data:image/')) throw new Error('Choose an image file before uploading.');
  const version = sessionVersion();
  const response = await fetch(preview);
  const image = await response.blob();
  if (image.size > 1_500_000) throw new Error('The resized image is too large. Choose a smaller image.');
  if (version !== sessionVersion()) throw new Error('Please sign in again.');
  const upload = uploadSchema.parse(await request('/api/media/uploads', 'POST', { kind, entityId, contentType: image.type }));
  if (version !== sessionVersion()) throw new Error('Please sign in again.');
  const { error } = await supabase.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, image, { contentType: image.type, cacheControl: '0', upsert: false });
  if (error) throw error;
  if (version !== sessionVersion()) throw new Error('Please sign in again.');
  return upload.sourceUrl;
}
