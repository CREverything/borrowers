import type { Pool } from "pg";

/**
 * Listing photos, kept in Postgres. Uploads arrive as raw bytes; the type is
 * taken from the file's own signature (not the client's header), and must be
 * JPEG, PNG or WebP. The browser shrinks photos first, so 2 MB is plenty.
 */
export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/** Works out the image type from its first bytes, or null if it isn't one we accept. */
export function sniffImageType(data: Buffer): ImageType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type ImageResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Adds a photo to a listing the user owns, after the others. */
export async function addImage(pool: Pool, ownerId: string, itemId: number, data: Buffer): Promise<ImageResult> {
  if (data.length === 0) return { ok: false, status: 400, error: "That photo was empty." };
  if (data.length > MAX_IMAGE_BYTES) return { ok: false, status: 413, error: "That photo is too large." };
  const type = sniffImageType(data);
  if (!type) return { ok: false, status: 415, error: "Photos must be JPEG, PNG or WebP." };

  const client = await pool.connect();
  try {
    await client.query("begin");
    // Locking the listing keeps two uploads from both squeezing past the limit.
    const item = await client.query<{ lender_id: string; status: string }>(
      "select lender_id, status from items where id = $1 for update",
      [itemId],
    );
    const row = item.rows[0];
    if (!row || row.status === "removed") {
      await client.query("rollback");
      return { ok: false, status: 404, error: "Listing not found." };
    }
    if (row.lender_id !== ownerId) {
      await client.query("rollback");
      return { ok: false, status: 403, error: "You can only add photos to your own listings." };
    }
    const count = await client.query<{ n: string; next: number }>(
      "select count(*) as n, coalesce(max(position), -1) + 1 as next from item_images where item_id = $1",
      [itemId],
    );
    if (Number(count.rows[0].n) >= MAX_IMAGES) {
      await client.query("rollback");
      return { ok: false, status: 409, error: `A listing can have up to ${MAX_IMAGES} photos.` };
    }
    await client.query(
      "insert into item_images (item_id, position, content_type, data) values ($1, $2, $3, $4)",
      [itemId, count.rows[0].next, type, data],
    );
    await client.query("update items set updated_at = now() where id = $1", [itemId]);
    await client.query("commit");
    return { ok: true };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Removes a photo from a listing the user owns. */
export async function deleteImage(pool: Pool, ownerId: string, itemId: number, imageId: string): Promise<ImageResult> {
  const result = await pool.query(
    `delete from item_images m using items i
     where m.id = $1 and m.item_id = $2 and i.id = m.item_id and i.lender_id = $3`,
    [imageId, itemId, ownerId],
  );
  if (result.rowCount) return { ok: true };
  const owner = await pool.query<{ lender_id: string }>("select lender_id from items where id = $1", [itemId]);
  if (owner.rows[0] && owner.rows[0].lender_id !== ownerId) {
    return { ok: false, status: 403, error: "You can only change your own listings." };
  }
  return { ok: false, status: 404, error: "Photo not found." };
}

/** A photo's bytes, unless its listing was removed. */
export async function getImage(pool: Pool, itemId: number, imageId: string) {
  const result = await pool.query<{ content_type: ImageType; data: Buffer }>(
    `select m.content_type, m.data from item_images m join items i on i.id = m.item_id
     where m.id = $1 and m.item_id = $2 and i.status <> 'removed'`,
    [imageId, itemId],
  );
  return result.rows[0] ?? null;
}
