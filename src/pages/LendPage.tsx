import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useAuthState } from "../auth/AuthContext";
import ListingForm, { emptyDraft } from "../components/ListingForm";
import { firstNameOnly } from "../data/users";
import LoginRequired from "../components/LoginRequired";
import { navigate, paths } from "../router";
import {
  createListing,
  ListingError,
  type FieldErrors,
} from "../services/listingsApi";

/** Keep the lender's name to their first name wherever it appears. */
export const cardName = (name: string) => firstNameOnly(name);

export default function LendPage() {
  const { status, user, getToken } = useAuthState();
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <div className="container page">
      <a className="back-link" href={paths.browse}>
        <ArrowLeft size={18} aria-hidden="true" />
        Back to marketplace
      </a>
      <header className="page__head">
        <h1>List an item</h1>
        <p className="page__lead">
          Share something you're not using and earn Switchies each day it's
          borrowed.
        </p>
      </header>

      {status === "signed-in" && user ? (
        <ListingForm
          mode="create"
          initial={emptyDraft}
          lenderName={cardName(user.name)}
          serverErrors={serverErrors}
          formError={formError}
          onCancel={() => navigate(paths.browse)}
          onSubmit={async (fields) => {
            setServerErrors({});
            setFormError(null);
            try {
              const item = await createListing(getToken, fields);
              navigate(paths.myListings(item.id));
            } catch (error) {
              const e = error as ListingError;
              setServerErrors(e.fields ?? {});
              setFormError(e.message);
            }
          }}
        />
      ) : (
        <LoginRequired
          title="Log in to list an item."
          message="Your listings are linked to your account so only you can edit them."
          returnTo="#/lend"
        />
      )}
    </div>
  );
}
