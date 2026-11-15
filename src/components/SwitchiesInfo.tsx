import { Coins, Info } from "lucide-react";
import { paths } from "../router";

export default function SwitchiesInfo() {
  return (
    <div className="switchies-info">
      <a
        href={paths.switchies}
        className="switchies-chip"
        aria-describedby="switchies-tip"
      >
        <Coins size={16} aria-hidden="true" />
        Switchies
        <Info size={14} aria-hidden="true" className="switchies-chip__info" />
      </a>
      <div role="tooltip" id="switchies-tip" className="tooltip">
        <strong>Switchies are campus credits</strong>
        <p>
          Earn them by lending your stuff and spend them to borrow from other
          students.
        </p>
      </div>
    </div>
  );
}
