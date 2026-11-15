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
 * authenticated request. The first time this server process sees a user it
 * also refreshes their name and avatar from Clerk, so a name changed in
 * "Manage account" (or a row saved before full names were stored) catches up.
 * A failed lookup never blanks out a name that's already stored.
 */
export async function ensureUserProfile(
  pool: Pool,
  clerkId: string,
  fetchProfile: FetchProfile,
): Promise<void> {
  if (known.has(clerkId)) return;

  let details: ProfileDetails | null = null;
  try {
    details = await fetchProfile(clerkId);
  } catch (error) {
    // The profile still gets created; the name can be filled in later.
    console.warn("[users] Could not load profile details from Clerk:", (error as Error).message);
  }
  await pool.query(
    `insert into users (clerk_id, display_name, avatar_url) values ($1, $2, $3)
     on conflict (clerk_id) do update
       set display_name = coalesce(nullif(excluded.display_name, ''), users.display_name),
           avatar_url = case when $4 then excluded.avatar_url else users.avatar_url end`,
    [clerkId, details?.displayName ?? "", details?.avatarUrl ?? null, details !== null],
  );
  known.add(clerkId);
}

/** The full stored profile name, tidied. Only shown on profile pages. */
export function fullName(name?: string | null): string {
  return name?.trim().replace(/\s+/g, " ") ?? "";
}

/**
 * First name and last initial ("Maya Reyes" -> "Maya R."), used everywhere
 * except profile pages. A single-word name is returned as is.
 */
export function shortName(name?: string | null): string {
  const parts = fullName(name).split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0];
  if (parts.length === 1) return first;
  const initial = Array.from(parts[parts.length - 1])[0]?.toUpperCase() ?? "";
  return `${first} ${initial}.`;
}
