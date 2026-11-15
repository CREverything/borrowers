import { CloudOff, Package, PackageOpen, Plus } from "lucide-react";
import type { ItemsStatus as Status } from "../services/itemsStore";
import { useStartListing } from "./LoginPrompt";

interface ItemsStatusProps {
  status: Status;
  onRetry: () => void;
}

/** Loading, error and "no listings yet" states, using the existing empty-state styles. */
export default function ItemsStatus({ status, onRetry }: ItemsStatusProps) {
  const startListing = useStartListing();

  // Loaded fine, but nobody has listed anything yet.
  if (status === "ready") {
    return (
      <div className="empty">
        <span className="empty__icon">
          <PackageOpen size={28} aria-hidden="true" />
        </span>
        <h3>No listings yet</h3>
        <p>Nobody on campus has listed anything so far. Be the first!</p>
        <button
          className="btn btn--primary"
          onClick={startListing}
        >
          <Plus size={18} aria-hidden="true" />
          Lend an item
        </button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="empty" role="alert">
        <span className="empty__icon">
          <CloudOff size={28} aria-hidden="true" />
        </span>
        <h3>We couldn't load listings</h3>
        <p>Check your connection and try again.</p>
        <button className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="empty" role="status">
      <span className="empty__icon">
        <Package size={28} className="pulse" aria-hidden="true" />
      </span>
      <h3>Loading listings...</h3>
    </div>
  );
}
