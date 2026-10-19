import { ASSET_BUCKET } from '@napl/contracts/storage';
import { supabase } from '../auth/client';

export const publicAssetUrl = (path: string): string => supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
