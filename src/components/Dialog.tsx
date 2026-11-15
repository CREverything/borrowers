import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A modal using the app's existing .modal styles. Open while mounted; calls
 * onClose when dismissed (Escape, the close button or the backdrop).
 */
export default function Dialog({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <div className="modal__content modal__content--form">
        <button
          type="button"
          className="modal__close"
          aria-label="Close"
          onClick={() => ref.current?.close()}
        >
          <X size={20} />
        </button>
        {icon && (
          <span className="modal__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
