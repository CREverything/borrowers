/**
 * API shape for a listing. Matches `Item` in the frontend's src/types.ts so
 * the UI can use responses without conversion.
 */
export type ISODate = string;

export const CATEGORIES = [
  "textbooks",
  "study",
  "tech",
  "dorm",
  "kitchen",
  "clothing",
  "events",
  "rec",
] as const;
export type CategoryId = (typeof CATEGORIES)[number];

export const CONDITIONS = ["Like new", "Good", "Fair"] as const;
export type ItemCondition = (typeof CONDITIONS)[number];

export const STATUSES = ["active", "hidden", "removed"] as const;
export type ItemStatus = (typeof STATUSES)[number];

/**
 * Icons a lender can pick as the listing's picture until photo uploads exist.
 * Must match the keys in the frontend's ItemIllustration icon map.
 */
export const ICON_KEYS = [
  "book",
  "calculator",
  "headphones",
  "fridge",
  "pot",
  "shirt",
  "desk-lamp",
  "dice",
  "projector",
  "speaker",
  "plug",
  "chair",
  "whiteboard",
  "marker",
  "lights",
  "table",
  "party",
  "box",
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

export interface Item {
  id: number;
  title: string;
  description: string;
  category: CategoryId;
  condition: ItemCondition;
  lenderId: string;
  /** The lender's display name from their profile; empty if they haven't set one. */
  lenderName: string;
  location: string;
  switchiesPerDay: number;
  rating?: { average: number; count: number };
  iconKey: string;
  /** The cover photo's URL (the first upload), or null. */
  imageUrl: string | null;
  /** Every uploaded photo, cover first. */
  images: { id: string; url: string }[];
  keywords: string[];
  status: ItemStatus;
  createdAt: string;
  availability: {
    bookedRanges: DateRange[];
    maxBorrowDays: number;
  };
}
