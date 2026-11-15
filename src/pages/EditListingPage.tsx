import { ArrowLeft, Package } from "lucide-react";
import { useState } from "react";
import { useAuthState } from "../auth/AuthContext";
import ItemsStatus from "../components/ItemsStatus";
import ListingForm, { draftFromItem } from "../components/ListingForm";
import LoginRequired from "../components/LoginRequired";
import { useMyListings } from "../hooks/useMyListings";
import { navigate, paths } from "../router";
import {
  ListingError,
  updateListing,
  type FieldErrors,
} from "../services/listingsApi";
import { cardName } from "./LendPage";

export default function EditListingPage({ id }: { id: number }) {
  const { status } = useAuthState();

  return (
    <div className="container page">
      <a className="back-link" href={paths.myListings()}>
        <ArrowLeft size={18} aria-hidden="true" />
        Back to my listings
      </a>
      <header className="page__head">
        <h1>Edit listing</h1>
      </header>
      {status === "signed-in" ? (
        <EditForm id={id} />
      ) : (
        <LoginRequired
          title="Log in to edit your listing."
          message="Only the person who listed an item can change it."
          returnTo={`#/my-listings/${id}/edit`}
        />
      )}
    </div>
  );
}

function EditForm({ id }: { id: number }) {
  const { user, getToken } = useAuthState();
  // Loaded from the user's own listings, so other people's items never open here.
  const { state, reload } = useMyListings();
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (state.status === "loading") return <ItemsStatus status="loading" onRetry={reload} />;
  if (state.status === "error") {
    return (
      <div className="empty" role="alert">
        <h3>We couldn't load this listing</h3>
        <p>{state.message}</p>
        <button className="btn btn--secondary" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }

  const item = state.items.find((i) => i.id === id);
  if (!item) {
    return (
      <div className="empty">
        <span className="empty__icon">
          <Package size={28} aria-hidden="true" />
        </span>
        <h3>This listing isn't yours to edit</h3>
        <p>It may have been removed, or it belongs to someone else.</p>
        <a className="btn btn--secondary" href={paths.myListings()}>
          Back to my listings
        </a>
      </div>
    );
  }

  return (
    <ListingForm
      mode="edit"
      initial={draftFromItem(item)}
      previewId={item.id}
      lenderName={item.lenderName || (user ? cardName(user.name) : "")}
      serverErrors={serverErrors}
      formError={formError}
      onCancel={() => navigate(paths.myListings())}
      onSubmit={async (fields, status) => {
        setServerErrors({});
        setFormError(null);
        try {
          await updateListing(getToken, item.id, { ...fields, status });
          navigate(paths.myListings());
        } catch (error) {
          const e = error as ListingError;
          setServerErrors(e.fields ?? {});
          setFormError(e.message);
        }
      }}
    />
  );
}
