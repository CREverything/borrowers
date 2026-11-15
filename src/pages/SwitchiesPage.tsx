import {
  ArrowLeftRight,
  Calculator,
  Coins,
  HandCoins,
  Package,
} from "lucide-react";
import { paths } from "../router";

const steps = [
  {
    icon: Package,
    title: "Lend",
    body: "List something you aren't using and set a daily price in Switchies.",
  },
  {
    icon: Coins,
    title: "Earn",
    body: "When a borrow you approved goes ahead, the Switchies for it go to you.",
  },
  {
    icon: HandCoins,
    title: "Spend",
    body: "Use your Switchies to borrow what you need from other students.",
  },
];

export default function SwitchiesPage() {
  return (
    <div className="container page page--narrow">
      <header className="page__head">
        <h1>How Switchies work</h1>
        <p className="page__lead">
          Switchies are borrowing credits. You earn them by lending your stuff,
          and spend them when you borrow from someone else. No real money
          needed.
        </p>
      </header>

      <ol className="steps">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="step">
            <span className={`step__icon tint-${index}`}>
              <Icon size={24} aria-hidden="true" />
            </span>
            <h2>{title}</h2>
            <p>{body}</p>
          </li>
        ))}
      </ol>

      <section className="example-card" aria-labelledby="example-title">
        <span className="example-card__icon tint-0">
          <Calculator size={40} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div>
          <h2 id="example-title">Example</h2>
          <p>
            Lend your calculator for 2 days at 4 Switchies/day and earn 8
            Switchies.
          </p>
          <p className="equation">
            <span>4 Swi. / day</span>
            <span aria-hidden="true">×</span>
            <span>2 days</span>
            <span aria-hidden="true">=</span>
            <strong>8 Switchies</strong>
          </p>
        </div>
      </section>

      <section className="prose">
        <h2>When do Switchies move?</h2>
        <ul>
          <li>
            Sending a borrow request doesn't spend anything. It just asks the
            lender.
          </li>
          <li>Switchies only move once the lender approves your request.</li>
          <li>If a request is declined or you cancel it, nothing changes.</li>
          <li>
            Prices are per day, and a borrow counts both the first and last day.
          </li>
          <li>
            Late returns cost 5 Switchies for every full hour past the return
            deadline, counted until the lender confirms it's back and paid to
            them then. While something is overdue you can't borrow anything new.
          </li>
        </ul>

        <h2>
          <ArrowLeftRight size={22} aria-hidden="true" /> Trading is separate
        </h2>
        <p>
          Want to swap instead? Item-for-item trades let two students exchange
          things directly, with no Switchies involved. Trading is coming soon
          and works separately from switchie borrowing...
        </p>
      </section>

      <div className="page__actions">
        <a className="btn btn--primary" href={paths.browse}>
          Browse items
        </a>
        <a className="btn btn--secondary" href={paths.plan()}>
          Plan an event
        </a>
      </div>
    </div>
  );
}
