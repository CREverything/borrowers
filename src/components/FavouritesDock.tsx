import { Coins, Heart, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuthState } from "../auth/AuthContext";
import { lenderNameOf } from "../data/users";
import { paths, type Route } from "../router";
import {
  getFavouritesState,
  loadFavourites,
  subscribeToFavourites,
} from "../services/favouritesStore";
import FavouriteButton from "./FavouriteButton";
import ItemIllustration from "./ItemIllustration";

/**
 * A small heart button in the bottom-right corner that opens your saved
 * listings. Signed-in users only. Closes on Escape, an outside click, or
 * moving to another page.
 */
export default function FavouritesDock({ route }: { route: Route }) {
  const { status } = useAuthState();
  const onAuthPage = route.name === "login" || route.name === "signup";
  if (status !== "signed-in" || onAuthPage) return null;
  return <Dock route={route} />;
}

function Dock({ route }: { route: Route }) {
  const { user, getToken } = useAuthState();
  const favourites = useSyncExternalStore(
    subscribeToFavourites,
    getFavouritesState,
  );
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const count = favourites.items.length;

  useEffect(() => setOpen(false), [route]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="favourites-dock" ref={rootRef}>
      {open && (
        <section
          className="favourites-panel"
          id={panelId}
          aria-labelledby={`${panelId}-title`}
        >
          <header className="favourites-panel__head">
            <h2 id={`${panelId}-title`}>Wishlist</h2>
            <button
              className="icon-btn"
              aria-label="Close favourites"
              onClick={() => setOpen(false)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>

          {favourites.status === "error" && count === 0 ? (
            <p className="favourites-panel__empty">
              Your favourites couldn't be loaded.{" "}
              <button
                className="link-btn"
                onClick={() => user && void loadFavourites(user.id, getToken)}
              >
                Try again
              </button>
            </p>
          ) : favourites.status === "loading" && count === 0 ? (
            <p className="favourites-panel__empty" role="status">
              Loading...
            </p>
          ) : count === 0 ? (
            <p className="favourites-panel__empty">
              Tap the <Heart size={14} aria-label="heart" /> on any listing to
              save it here.
            </p>
          ) : (
            <ul className="favourites-panel__list">
              {favourites.items.map((item) => (
                <li key={item.id} className="favourite-row">
                  <ItemIllustration
                    item={item}
                    size={20}
                    className="favourite-row__thumb"
                  />
                  <div className="favourite-row__text">
                    <a href={paths.item(item.id)}>{item.title}</a>
                    <span className="muted small">
                      <Coins size={12} aria-hidden="true" />{" "}
                      {item.switchiesPerDay}/day · {lenderNameOf(item)}
                    </span>
                  </div>
                  <FavouriteButton
                    item={item}
                    className="favourite-row__remove"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <button
        ref={buttonRef}
        className={`favourites-fab${open ? " favourites-fab--open" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Wishlist${count ? `, ${count} saved` : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Heart
          size={22}
          aria-hidden="true"
          fill={count ? "currentColor" : "none"}
        />
        {count > 0 && (
          <span className="favourites-fab__count" aria-hidden="true">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </div>
  );
}
