import { useEffect, useState } from "react";
import Header from "./components/Header";
import { defaultFilters, type MarketplaceFilters } from "./lib/marketplace";
import AuthPage from "./pages/AuthPage";
import EventPlannerPage from "./pages/EventPlannerPage";
import HomePage from "./pages/HomePage";
import ItemDetailPage from "./pages/ItemDetailPage";
import ProfilePage from "./pages/ProfilePage";
import RequestsPage from "./pages/RequestsPage";
import SwitchiesPage from "./pages/SwitchiesPage";
import { scrollToSection } from "./lib/scroll";
import { useRoute, type Route } from "./router";

export default function App() {
  const route = useRoute();
  // Lives here so search and filters survive a trip to an item page and back.
  const [filters, setFilters] = useState<MarketplaceFilters>(defaultFilters);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (route.name === "home" && route.section === "browse") {
      // Glide down to the listings rather than jumping.
      requestAnimationFrame(() => scrollToSection("browse"));
    } else {
      // A new page starts at the top straight away.
      window.scrollTo(0, 0);
    }
  }, [route]);

  const renderPage = (r: Route) => {
    switch (r.name) {
      case "item":
        return <ItemDetailPage id={r.id} />;
      case "plan":
        return <EventPlannerPage query={r.query} />;
      case "switchies":
        return <SwitchiesPage />;
      case "requests":
        return <RequestsPage />;
      case "profile":
        return <ProfilePage />;
      // One element for both, so state survives switching between them.
      case "login":
      case "signup":
        return <AuthPage mode={r.name} returnTo={r.returnTo} />;
      default:
        return (
          <HomePage
            filters={filters}
            onFiltersChange={setFilters}
            showAll={showAll}
            onShowAll={() => setShowAll(true)}
          />
        );
    }
  };

  return (
    <>
      <Header route={route} />
      <main>{renderPage(route)}</main>
      <footer className="footer">
        <div className="container footer__inner">
          <span className="logo logo--small">borrowers</span>
          <span className="muted">Made by CREverything and Punyah07</span>
        </div>
      </footer>
    </>
  );
}
