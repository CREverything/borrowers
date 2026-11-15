import type { LucideIcon } from "lucide-react";
import {
  BedDouble,
  BookOpen,
  CookingPot,
  Gamepad2,
  LayoutGrid,
  Laptop,
  PartyPopper,
  PencilRuler,
  Shirt,
} from "lucide-react";
import type { CategoryFilterId, CategoryId } from "../types";

export interface Category {
  id: CategoryFilterId;
  label: string;
  icon: LucideIcon;
}

export const categories: Category[] = [
  { id: "all", label: "All items", icon: LayoutGrid },
  { id: "textbooks", label: "Textbooks", icon: BookOpen },
  { id: "study", label: "Study", icon: PencilRuler },
  { id: "tech", label: "Tech", icon: Laptop },
  { id: "dorm", label: "Dorm", icon: BedDouble },
  { id: "kitchen", label: "Kitchen", icon: CookingPot },
  { id: "events", label: "Events", icon: PartyPopper },
  { id: "clothing", label: "Formals", icon: Shirt },
  { id: "rec", label: "Games", icon: Gamepad2 },
];

export function getCategoryLabel(id: CategoryId | CategoryFilterId): string {
  return categories.find((c) => c.id === id)?.label ?? "Other";
}
