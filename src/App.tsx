import { useEffect, useState } from "react";
import ActivityBar from "./components/ActivityBar";
import FavouritesDock from "./components/FavouritesDock";
import OverdueBanner from "./components/OverdueBanner";
import Header from "./components/Header";
import { useAccountSync } from "./hooks/useRequests";
import { defaultFilters, type MarketplaceFilters } from "./lib/marketplace";
import AuthPage from "./pages/AuthPage";
import EventPlannerPage from "./pages/EventPlannerPage";
import HomePage from "./pages/HomePage";
import EditListingPage from "./pages/EditListingPage";
import ItemDetailPage from "./pages/ItemDetailPage";
import LendPage from "./pages/LendPage";
import MyListingsPage from "./pages/MyListingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import ProfilePage from "./pages/ProfilePage";
import RequestsPage from "./pages/RequestsPage";
import SwitchiesPage from "./pages/SwitchiesPage";
import UserPage from "./pages/UserPage";
import NotificationToasts from "./components/NotificationToasts";
import { scrollToSection } from "./lib/scroll";
import { useRoute, type Route } from "./router";

export default function App() {
  const route = useRoute();
  // Loads the logged-in user's requests and Switchies balance.
  useAccountSync();
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
        return <EventPlannerPage query={r.query} planId={r.planId} mine={r.mine} />;
      case "switchies":
        return <SwitchiesPage />;
      case "requests":
        return <RequestsPage tab={r.tab} section={r.section} view={r.view} focus={r.focus} />;
      case "profile":
        return <ProfilePage />;
      case "user":
        return <UserPage id={r.id} />;
      case "lend":
        return <LendPage />;
      case "notifications":
        return <NotificationsPage />;
      case "my-listings":
        return <MyListingsPage createdId={r.createdId} />;
      case "edit-listing":
        return <EditListingPage id={r.id} />;
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
      {/* Header and activity bar stick together; see ActivityBar for the collapse. */}
      <div className="site-top">
        <Header route={route} />
        <ActivityBar route={route} />
        {/* Pop-ups hang from the top right, just under the header and bar. */}
        <NotificationToasts hidden={route.name === "notifications"} />
      </div>
      {/* Holds the activity bar's space at the top of the page (0 when it's not shown). */}
      <div className="activity-spacer" aria-hidden="true" />
      <main>
        <OverdueBanner route={route} />
        {renderPage(route)}
      </main>
      <FavouritesDock route={route} />
      <footer className="footer">
        <div className="container footer__inner">
          <span className="logo logo--small">borrowers</span>
          <span className="muted">Made by CREverything and Punyah07</span>
        </div>
      </footer>
    </>
  );
}
