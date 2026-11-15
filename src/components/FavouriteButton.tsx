import { Heart } from "lucide-react";
import { useSyncExternalStore, type MouseEvent } from "react";
import { useAuthState } from "../auth/AuthContext";
import { getFavouritesState, subscribeToFavourites, toggleFavourite } from "../services/favouritesStore";
import type { Item } from "../types";
import { useRequireAuth } from "./LoginPrompt";

/** The heart on cards and item pages. Guests are asked to log in first. */
export default function FavouriteButton({ item, className = "card__save" }: { item: Item; className?: string }) {
  const requireAuth = useRequireAuth();
  const { getToken } = useAuthState();
  const saved = useSyncExternalStore(subscribeToFavourites, getFavouritesState).ids.has(item.id);

  const onClick = (e: MouseEvent) => {
    // Cards are clickable as a whole; don't open the item.
    e.stopPropagation();
    e.preventDefault();
    if (!requireAuth("favourite")) return;
    void toggleFavourite(getToken, item);
  };

  return (
    <button
      type="button"
      className={`${className}${saved ? " card__save--on" : ""}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${item.title} from favourites` : `Save ${item.title} to favourites`}
      onClick={onClick}
    >
      <Heart size={18} aria-hidden="true" fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
