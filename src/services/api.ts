/**
 * Calls a protected backend endpoint with the current Clerk session token.
 * The token is fetched fresh for each call (Clerk caches and refreshes it)
 * and only ever travels in the Authorization header. The backend works out
 * who the user is from that token, so we never send a user ID ourselves.
 */
export async function authedFetch(
  path: string,
  getToken: () => Promise<string | null>,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getToken();
  if (!token) throw new Error("Not logged in");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}
