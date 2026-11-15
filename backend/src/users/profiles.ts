import type { Pool } from "pg";

export interface ProfileDetails {
  displayName: string;
  avatarUrl: string | null;
}

/** Looks up name and avatar for a new profile. Given only a verified Clerk user id. */
export type FetchProfile = (clerkId: string) => Promise<ProfileDetails>;

// Ids already known to have a users row, so most requests skip the query.
const known = new Set<string>();

/**
 * Makes sure the verified user has a users row, creating it on their first
 * authenticated request. An existing row is reused and left unchanged, and
 * `on conflict do nothing` keeps concurrent first requests from duplicating it.
 */
export async function ensureUserProfile(
  pool: Pool,
  clerkId: string,
  fetchProfile: FetchProfile,
): Promise<void> {
  if (known.has(clerkId)) return;

  const existing = await pool.query("select 1 from users where clerk_id = $1", [clerkId]);
  if (existing.rowCount === 0) {
    let details: ProfileDetails = { displayName: "", avatarUrl: null };
    try {
      details = await fetchProfile(clerkId);
    } catch (error) {
      // The profile still gets created; the name can be filled in later.
      console.warn("[users] Could not load profile details from Clerk:", (error as Error).message);
    }
    await pool.query(
      `insert into users (clerk_id, display_name, avatar_url) values ($1, $2, $3)
       on conflict (clerk_id) do nothing`,
      [clerkId, details.displayName, details.avatarUrl],
    );
  }
  known.add(clerkId);
}

/** Return only the first whitespace-delimited part of a stored profile name. */
export function firstNameOnly(name?: string | null): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}
