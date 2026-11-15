import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  /** Accessible name, e.g. "Sort by". */
  label: string;
  icon?: LucideIcon;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** "pill" (default) for toolbars; "field" to look like a form input. */
  variant?: "pill" | "field";
  /** Shown when `value` isn't one of the options, e.g. "Choose a time". */
  placeholder?: string;
  /** Points a <label htmlFor> at the trigger. */
  id?: string;
  /** Marks the field as invalid, like aria-invalid on an input. */
  invalid?: boolean;
}

/**
 * A styled replacement for <select>, following the ARIA listbox pattern:
 * arrow keys, Home/End and type-ahead move through options, Enter or Space
 * chooses, Escape or Tab closes.
 */
export default function Dropdown<T extends string>({
  label,
  icon: Icon,
  value,
  options,
  onChange,
  variant = "pill",
  placeholder,
  id: triggerId,
  invalid,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Open toward the left when there isn't room on the right.
  const [alignEnd, setAlignEnd] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const matchIndex = options.findIndex((o) => o.value === value);
  const selectedIndex = Math.max(0, matchIndex);
  const shownLabel = matchIndex >= 0 ? options[matchIndex].label : (placeholder ?? options[0]?.label);

  const openList = (index = selectedIndex) => {
    const box = rootRef.current?.getBoundingClientRect();
    // Triggers on the right half of the screen open toward the left.
    if (box) setAlignEnd(box.left + box.width / 2 > window.innerWidth / 2);
    setActive(index);
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const choose = (index: number) => {
    onChange(options[index].value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (open) {
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active, id]);

  const onButtonKey = (e: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openList();
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    const last = options.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(last, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (e.key.length === 1) {
          const match = options.findIndex((o) =>
            o.label.toLowerCase().startsWith(e.key.toLowerCase()),
          );
          if (match >= 0) setActive(match);
        }
    }
  };

  return (
    <div
      className={`dropdown dropdown--${variant}${open ? " dropdown--open" : ""}${matchIndex < 0 && placeholder ? " dropdown--empty" : ""}`}
      ref={rootRef}
    >
      <button
        ref={buttonRef}
        type="button"
        id={triggerId}
        className="dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-invalid={invalid || undefined}
        aria-label={`${label}: ${shownLabel}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKey}
      >
        {Icon && <Icon size={16} aria-hidden="true" />}
        <span>{shownLabel}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="dropdown__chevron"
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          className={`dropdown__list${alignEnd ? " dropdown__list--end" : ""}`}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={`${id}-option-${active}`}
          onKeyDown={onListKey}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={selected}
                className={[
                  "dropdown__option",
                  index === active && "dropdown__option--active",
                  selected && "dropdown__option--selected",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                {option.label}
                {selected && <Check size={16} aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
