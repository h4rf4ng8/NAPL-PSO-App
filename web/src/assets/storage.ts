import { supabase } from '../auth/client';

export const publicAssetUrl = (path: string): string => supabase.storage.from('asl-assets').getPublicUrl(path).data.publicUrl;
