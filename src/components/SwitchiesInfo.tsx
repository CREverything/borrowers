import { Coins, Info } from "lucide-react";
import { useAuthState } from "../auth/AuthContext";
import { SWITCHIES_BALANCE } from "../data/account";

export default function SwitchiesInfo() {
  const { status } = useAuthState();
  const showBalance = status === "signed-in";

  return (
    <div className="switchies-info">
      <a className="switchies-chip" aria-describedby="switchies-tip">
        <Coins size={16} aria-hidden="true" />
        {showBalance ? (
          <>
            <strong className="switchies-chip__balance">
              {SWITCHIES_BALANCE}
            </strong>
            Switchies
          </>
        ) : (
          "Switchies"
        )}
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
