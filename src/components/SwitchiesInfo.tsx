import { Coins, Info } from "lucide-react";
import { useAuthState } from "../auth/AuthContext";
import { useBalance } from "../hooks/useRequests";

export default function SwitchiesInfo() {
  const { status } = useAuthState();
  const balance = useBalance();
  const showBalance = status === "signed-in" && balance !== null;

  return (
    <div className="switchies-info">
      <a className="switchies-chip" aria-describedby="switchies-tip">
        <Coins size={16} aria-hidden="true" />
        {showBalance ? (
          <>
            <strong className="switchies-chip__balance">
              {balance}
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
