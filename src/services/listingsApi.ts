import type { CategoryId, Item, ItemCondition } from "../types";
import { authedFetch } from "./api";
import { refreshActivity } from "./activityStore";
import { loadItems } from "./itemsStore";

/**
 * Calls the protected listing endpoints. The backend takes the owner from
 * the verified Clerk session, so no user or lender id is ever sent.
 */
export interface ListingFields {
  title: string;
  description: string;
  category: CategoryId;
  condition: ItemCondition;
  location: string;
  switchiesPerDay: number;
  maxBorrowDays: number;
  iconKey: string;
  keywords: string[];
}

export type ListingStatus = "active" | "hidden";

export type FieldErrors = Partial<Record<keyof ListingFields | "status", string>>;

/** A failed call, with per-field messages when the server rejected the input. */
export class ListingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: FieldErrors = {},
  ) {
    super(message);
  }
}

type GetToken = () => Promise<string | null>;

async function request<T>(
  path: string,
  getToken: GetToken,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await authedFetch(path, getToken, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
  } catch (error) {
    const message =
      (error as Error).message === "Not logged in"
        ? "Please log in again."
        : "We couldn't reach the server. Check your connection and try again.";
    throw new ListingError(message, 0);
  }

  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string; fields?: FieldErrors })
    | null;
  if (!response.ok) {
    const fallback =
      response.status === 401
        ? "Your session has expired. Please log in again."
        : response.status === 403
          ? "You can only change your own listings."
          : response.status === 404
            ? "That listing no longer exists."
            : "Something went wrong. Please try again.";
    throw new ListingError(body?.error ?? fallback, response.status, body?.fields);
  }
  return body as T;
}

export const fetchMyListings = (getToken: GetToken) =>
  request<Item[]>("/api/my-items", getToken);

export async function createListing(getToken: GetToken, fields: ListingFields) {
  const item = await request<Item>("/api/items", getToken, {
    method: "POST",
    body: JSON.stringify(fields),
  });
  void loadItems(true); // Show it in the marketplace straight away.
  void refreshActivity(getToken);
  return item;
}

export async function updateListing(
  getToken: GetToken,
  id: number,
  changes: Partial<ListingFields> & { status?: ListingStatus },
) {
  const item = await request<Item>(`/api/items/${id}`, getToken, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
  void loadItems(true);
  void refreshActivity(getToken);
  return item;
}

export async function removeListing(getToken: GetToken, id: number) {
  const item = await request<Item>(`/api/items/${id}`, getToken, { method: "DELETE" });
  void loadItems(true);
  void refreshActivity(getToken);
  return item;
}

/** Adds a photo (already shrunk) to your listing. Resolves to the updated listing. */
export async function uploadListingImage(getToken: GetToken, itemId: number, photo: Blob) {
  const response = await authedFetch(`/api/items/${itemId}/images`, getToken, {
    method: "POST",
    headers: { "Content-Type": photo.type || "image/jpeg", Accept: "application/json" },
    body: photo,
  });
  const body = (await response.json().catch(() => null)) as (Item & { error?: string }) | null;
  if (!response.ok) {
    throw new ListingError(body?.error ?? "A photo couldn't be uploaded.", response.status);
  }
  return body as Item;
}

/** Removes a photo from your listing. */
export async function deleteListingImage(getToken: GetToken, itemId: number, imageId: string) {
  await request<Item>(`/api/items/${itemId}/images/${encodeURIComponent(imageId)}`, getToken, {
    method: "DELETE",
  });
}

/**
 * Applies photo changes after a listing is saved: removals first (so the
 * 6-photo limit has room), then uploads in order. Refreshes the marketplace once.
 */
export async function savePhotoChanges(
  getToken: GetToken,
  itemId: number,
  changes: { add: Blob[]; removeIds: string[] },
) {
  if (changes.add.length === 0 && changes.removeIds.length === 0) return;
  try {
    for (const imageId of changes.removeIds) await deleteListingImage(getToken, itemId, imageId);
    for (const photo of changes.add) await uploadListingImage(getToken, itemId, photo);
  } finally {
    void loadItems(true);
  }
}
