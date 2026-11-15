/**
 * API shape for a listing. Matches `Item` in the frontend's src/types.ts so
 * the UI can use responses without conversion.
 */
export type ISODate = string;

export type CategoryId =
  | "textbooks"
  | "study"
  | "tech"
  | "dorm"
  | "kitchen"
  | "clothing"
  | "events"
  | "rec";

export type ItemCondition = "Like new" | "Good" | "Fair";

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
  location: string;
  switchiesPerDay: number;
  rating?: { average: number; count: number };
  iconKey: string;
  keywords: string[];
  availability: {
    bookedRanges: DateRange[];
    maxBorrowDays: number;
  };
}
