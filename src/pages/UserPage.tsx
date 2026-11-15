import { ArrowLeft, MessageCircle, Package, UserRoundX } from "lucide-react";
import { useAuthState } from "../auth/AuthContext";
import { useMessaging } from "../components/MessagingProvider";
import ItemCard from "../components/ItemCard";
import { Stars } from "../components/StarRating";
import { Avatar } from "../components/UserMenu";
import { usePublicProfile } from "../hooks/usePublicProfile";
import { paths } from "../router";
import type { PublicProfile, Rating } from "../types";

export const memberSince = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });

export const itemsLentLabel = (n: number) => `${n} ${n === 1 ? "item" : "items"} lent`;

/** Someone's public profile: full name, how much they've lent, and their listings. */
export default function UserPage({ id }: { id: string }) {
  const { user } = useAuthState();
  const messaging = useMessaging();
  const load = usePublicProfile(id);

  if (load.status === "loading") {
    return (
      <div className="container page">
        <p className="muted" role="status">
          Loading profile...
        </p>
      </div>
    );
  }

  if (load.status !== "ready") {
    return (
      <div className="container page">
        <div className="empty">
          <span className="empty__icon">
            <UserRoundX size={28} aria-hidden="true" />
          </span>
          <h3>{load.status === "missing" ? "We couldn't find that account" : "This profile couldn't be loaded"}</h3>
          <p>
            {load.status === "missing"
              ? "The link may be wrong, or the account was removed."
              : "Check your connection and try again."}
          </p>
          <a className="btn btn--secondary" href={paths.browse}>
            Back to marketplace
          </a>
        </div>
      </div>
    );
  }

  const { profile } = load;
  const name = profile.name || "A student";
  const isMe = user?.id === profile.id;

  return (
    <div className="container page">
      <a className="back-link" href={paths.browse}>
        <ArrowLeft size={18} aria-hidden="true" />
        Back to marketplace
      </a>

      <header className="profile">
        <Avatar name={name} imageUrl={profile.avatarUrl} size={88} />
        <div>
          <div className="profile__name-row">
            <h1>{name}</h1>
            {!isMe && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={messaging.loading}
                onClick={() => messaging.startDirect(profile.id)}
              >
                <MessageCircle size={18} aria-hidden="true" />
                Message
              </button>
            )}
          </div>
          <p className="muted small">Member since {memberSince(profile.memberSince)}</p>
          {isMe && (
            <p className="small">
              This is how others see you. <a className="link" href={paths.profile}>Go to your account</a>
            </p>
          )}
        </div>
      </header>

      <ProfileStats profile={profile} />

      <section className="user-listings" aria-labelledby="user-listings-title">
        <h2 id="user-listings-title">
          {isMe ? "Your listings" : `Listings by ${name.split(" ")[0]}`}
        </h2>
        {profile.listings.length === 0 ? (
          <div className="empty">
            <span className="empty__icon">
              <Package size={28} aria-hidden="true" />
            </span>
            <h3>No listings right now</h3>
            <p>Nothing from {isMe ? "you" : name.split(" ")[0]} is up for borrowing at the moment.</p>
          </div>
        ) : (
          <div className="grid">
            {profile.listings.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Items lent plus lender and borrower ratings, as a row of tiles. */
export function ProfileStats({ profile }: { profile: PublicProfile }) {
  return (
    <dl className="profile-stats">
      <div className="profile-stats__tile">
        <dt>Items lent</dt>
        <dd>
          <strong>{profile.itemsLent}</strong>
        </dd>
      </div>
      <RatingTile label="As a lender" rating={profile.lenderRating} unit="review" />
      <RatingTile label="As a borrower" rating={profile.borrowerScore} unit="lender score" />
    </dl>
  );
}

function RatingTile({ label, rating, unit }: { label: string; rating: Rating | null; unit: string }) {
  return (
    <div className="profile-stats__tile">
      <dt>{label}</dt>
      <dd>
        {rating ? (
          <>
            <strong>{rating.average.toFixed(1)}</strong>
            <Stars value={rating.average} size={14} />
            <span className="muted small">
              {rating.count} {rating.count === 1 ? unit : `${unit}s`}
            </span>
          </>
        ) : (
          <span className="muted small">No ratings yet</span>
        )}
      </dd>
    </div>
  );
}
