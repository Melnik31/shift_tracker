import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Every FileUpload lives in Supabase Storage now, not on local disk — a
// serverless/ephemeral filesystem can't be trusted to keep files across
// requests or deploys. The bucket is public (created via the Supabase
// dashboard/API as `SUPABASE_STORAGE_BUCKET`), so uploads get a directly
// fetchable URL with no separate signing step.
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'shift-attachments';
const PUBLIC_URL_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

export async function uploadFile(buffer: Buffer, originalName: string, mimetype: string): Promise<{ url: string }> {
  const objectPath = `${crypto.randomUUID()}-${originalName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, { contentType: mimetype });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return { url: data.publicUrl };
}

// FileUpload only stores the public URL (no separate object-key column —
// keeps the schema unchanged from the local-disk version), so deleting
// needs to recover the object's path within the bucket from that URL.
export async function deleteFile(url: string): Promise<void> {
  const idx = url.indexOf(PUBLIC_URL_PREFIX);
  if (idx === -1) return; // not a URL this bucket issued — nothing to clean up
  const objectPath = url.slice(idx + PUBLIC_URL_PREFIX.length);
  await supabase.storage.from(BUCKET).remove([objectPath]);
}
