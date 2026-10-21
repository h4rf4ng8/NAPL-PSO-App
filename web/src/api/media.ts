import { imageUploadInput, imageUploadResponse, MAX_IMAGE_BYTES, type ImageKind } from '@napl/contracts/storage';
import { supabase, sessionVersion } from '../auth/client';
import { request } from './http';

export async function uploadImage(kind: ImageKind, entityId: string, preview: string): Promise<string> {
  if (!preview.startsWith('data:image/')) throw new Error('Choose an image file before uploading.');
  const version = sessionVersion();
  const response = await fetch(preview);
  const image = await response.blob();
  if (image.size > MAX_IMAGE_BYTES) throw new Error('The resized image is too large. Choose a smaller image.');
  if (version !== sessionVersion()) throw new Error('Please sign in again.');
  const upload = imageUploadResponse.parse(await request('/api/media/uploads', 'POST', imageUploadInput.parse({ kind, entityId, contentType: image.type })));
  if (version !== sessionVersion()) throw new Error('Please sign in again.');
  const { error } = await supabase.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, image, { contentType: image.type, cacheControl: '0', upsert: false });
  if (error) throw error;
  if (version !== sessionVersion()) throw new Error('Please sign in again.');
  return upload.sourceUrl;
}
