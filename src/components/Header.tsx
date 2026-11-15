import { Plus } from "lucide-react";
import type { MouseEvent } from "react";
import { paths, type Route } from "../router";
import { useLoginPrompt } from "./LoginPrompt";
import SwitchiesInfo from "./SwitchiesInfo";

export default function Header({ route }: { route: Route }) {
  const promptLogin = useLoginPrompt();

  const links = [
    {
      href: paths.browse,
      label: "Browse",
      active: route.name === "home" || route.name === "item",
    },
    { href: paths.plan(), label: "Plan", active: route.name === "plan" },
    {
      href: paths.requests,
      label: "My Requests",
      active: route.name === "requests",
    },
    {
      href: paths.switchies,
      label: "How Switchies Work",
      active: route.name === "switchies",
    },
  ];

  // Clicking a link to the current hash fires no hashchange, so scroll by hand.
  const handleClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (window.location.hash !== href) return;
    e.preventDefault();
    if (href === paths.browse)
      document.getElementById("browse")?.scrollIntoView({ behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="header">
      <div className="container header__inner">
        <a href={paths.home} className="logo" aria-label="borrowers home">
          borrowers
        </a>

        <nav className="nav" aria-label="Main">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={link.active ? "nav__link--active" : undefined}
              aria-current={link.active ? "page" : undefined}
              onClick={(e) => handleClick(e, link.href)}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="header__actions">
          <SwitchiesInfo />
          <button className="btn btn--secondary">Sign in</button>
          <button
            className="btn btn--primary"
            onClick={() => promptLogin("lend")}
          >
            <Plus size={18} />
            Lend an item
          </button>
        </div>
      </div>
    </header>
  );
}
