import { Bell, ClipboardList, LogOut, Package, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { AuthUser } from "../auth/AuthContext";
import { useAuthState } from "../auth/AuthContext";
import { initialOf } from "../data/users";
import { navigate, paths } from "../router";

/** A round photo, or the first initial when there's no photo (or it fails to load). */
export function Avatar({
  name,
  imageUrl,
  size = 40,
}: {
  name: string;
  imageUrl: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (imageUrl && !broken) {
    return (
      <img
        className="avatar avatar--image"
        src={imageUrl}
        alt=""
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="avatar" aria-hidden="true" style={style}>
      {initialOf(name)}
    </span>
  );
}

export function ProfileAvatar({ user, size = 40 }: { user: AuthUser; size?: number }) {
  return <Avatar name={user.name} imageUrl={user.imageUrl} size={size} />;
}

export default function UserMenu({ user }: { user: AuthUser }) {
  const { signOut } = useAuthState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        className="user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <ProfileAvatar user={user} />
      </button>

      {open && (
        <div className="user-menu__panel" id={menuId} role="menu">
          <div className="user-menu__who">
            <strong>{user.name}</strong>
            {user.email && <span className="muted">{user.email}</span>}
          </div>
          <button role="menuitem" onClick={() => go(paths.profile)}>
            <UserRound size={18} aria-hidden="true" />
            Profile
          </button>
          <button role="menuitem" onClick={() => go(paths.myListings())}>
            <Package size={18} aria-hidden="true" />
            My listings
          </button>
          <button role="menuitem" onClick={() => go(paths.notifications)}>
            <Bell size={18} aria-hidden="true" />
            Notifications
          </button>
          <button role="menuitem" onClick={() => go(paths.requests)}>
            <ClipboardList size={18} aria-hidden="true" />
            My requests
          </button>
          <div role="separator" className="user-menu__divider" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            <LogOut size={18} aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
