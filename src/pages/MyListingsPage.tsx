import { CircleCheckBig, Coins, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuthState } from "../auth/AuthContext";
import ItemIllustration from "../components/ItemIllustration";
import ItemsStatus from "../components/ItemsStatus";
import LoginRequired from "../components/LoginRequired";
import { getCategoryLabel } from "../data/categories";
import { useMyListings } from "../hooks/useMyListings";
import { navigate, paths } from "../router";
import { ListingError, removeListing } from "../services/listingsApi";
import type { Item } from "../types";

export default function MyListingsPage({ createdId }: { createdId: number | null }) {
  const { status } = useAuthState();

  return (
    <div className="container page page--narrow">
      <header className="page__head my-listings__head">
        <div>
          <h1>My listings</h1>
          <p className="page__lead">Everything you're lending out on campus.</p>
        </div>
        {status === "signed-in" && (
          <a className="btn btn--primary" href={paths.lend}>
            <Plus size={18} aria-hidden="true" />
            List an item
          </a>
        )}
      </header>

      {status === "signed-in" ? (
        <Listings createdId={createdId} />
      ) : (
        <LoginRequired
          title="Log in to see your listings."
          message="Once you're logged in, you can add, edit and remove the things you lend."
          returnTo="#/my-listings"
        />
      )}
    </div>
  );
}

function Listings({ createdId }: { createdId: number | null }) {
  const { getToken } = useAuthState();
  const { state, reload, replace } = useMyListings();
  const [confirming, setConfirming] = useState<Item | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (confirming && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [confirming]);

  if (state.status === "loading") return <ItemsStatus status="loading" onRetry={reload} />;
  if (state.status === "error") {
    return (
      <div className="empty" role="alert">
        <h3>We couldn't load your listings</h3>
        <p>{state.message}</p>
        <button className="btn btn--secondary" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }

  const created = createdId ? state.items.find((i) => i.id === createdId) : undefined;

  const confirmRemove = async () => {
    if (!confirming) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeListing(getToken, confirming.id);
      replace((items) => items.filter((i) => i.id !== confirming.id));
      dialogRef.current?.close();
    } catch (error) {
      setRemoveError((error as ListingError).message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      {created && (
        <div className="notice notice--success" role="status">
          <CircleCheckBig size={20} aria-hidden="true" />
          <p>
            <strong>{created.title} is live.</strong> Other students can now
            find it in the marketplace.{" "}
            <a className="link" href={paths.item(created.id)}>
              View listing
            </a>
          </p>
        </div>
      )}

      {state.items.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">
            <Package size={28} aria-hidden="true" />
          </span>
          <h3>You haven't listed anything yet</h3>
          <p>List something you're not using and earn Switchies when it's borrowed.</p>
          <a className="btn btn--primary" href={paths.lend}>
            <Plus size={18} aria-hidden="true" />
            List an item
          </a>
        </div>
      ) : (
        <ul className="listing-list">
          {state.items.map((item) => (
            <li key={item.id} className="listing-row">
              <ItemIllustration item={item} size={26} className="listing-row__thumb" />
              <div className="listing-row__text">
                {item.status === "active" ? (
                  <a href={paths.item(item.id)}>{item.title}</a>
                ) : (
                  <strong>{item.title}</strong>
                )}
                <span className="muted">
                  {getCategoryLabel(item.category)} ·{" "}
                  <Coins size={14} aria-hidden="true" /> {item.switchiesPerDay} Swi. / day
                </span>
              </div>
              <span className={`status status--${item.status === "hidden" ? "hidden" : "live"}`}>
                {item.status === "hidden" ? "Hidden" : "Active"}
              </span>
              <div className="listing-row__actions">
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => navigate(paths.editListing(item.id))}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Edit
                </button>
                <button
                  className="btn btn--ghost btn--sm listing-row__remove"
                  onClick={() => {
                    setRemoveError(null);
                    setConfirming(item);
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="remove-title"
        onClose={() => setConfirming(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
      >
        {confirming && (
          <div className="modal__content">
            <button
              className="modal__close"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              <X size={20} />
            </button>
            <span className="modal__icon modal__icon--danger" aria-hidden="true">
              <Trash2 size={24} />
            </span>
            <h2 id="remove-title">Remove {confirming.title}?</h2>
            <p className="muted">
              It will disappear from the marketplace and your listings.
            </p>
            {removeError && (
              <p className="form-error" role="alert">
                {removeError}
              </p>
            )}
            <div className="modal__actions">
              <button className="btn btn--secondary" onClick={() => dialogRef.current?.close()}>
                Keep it
              </button>
              <button className="btn btn--primary" disabled={removing} onClick={confirmRemove}>
                {removing ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
