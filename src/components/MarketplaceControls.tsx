import { ArrowUpDown, CalendarCheck } from "lucide-react";
import {
  availabilityOptions,
  sortOptions,
  type AvailabilityFilter,
  type SortOption,
} from "../lib/marketplace";
import Dropdown from "./Dropdown";

interface MarketplaceControlsProps {
  availability: AvailabilityFilter;
  sort: SortOption;
  onAvailabilityChange: (value: AvailabilityFilter) => void;
  onSortChange: (value: SortOption) => void;
}

export default function MarketplaceControls({
  availability,
  sort,
  onAvailabilityChange,
  onSortChange,
}: MarketplaceControlsProps) {
  return (
    <div className="controls">
      <Dropdown
        label="Availability"
        icon={CalendarCheck}
        value={availability}
        options={availabilityOptions}
        onChange={onAvailabilityChange}
      />
      <Dropdown
        label="Sort by"
        icon={ArrowUpDown}
        value={sort}
        options={sortOptions}
        onChange={onSortChange}
      />
    </div>
  );
}
