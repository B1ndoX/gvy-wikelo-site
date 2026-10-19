import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export type SelectOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
};

export function selectMenuPosition(rect: Pick<DOMRect, "left" | "top" | "bottom" | "width">, viewportWidth: number, viewportHeight: number, optionCount: number): CSSProperties {
  const width = Math.min(Math.max(rect.width, 190), Math.max(0, viewportWidth - 16));
  const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
  const below = Math.max(0, viewportHeight - rect.bottom - 13);
  const above = Math.max(0, rect.top - 13);
  const openAbove = below < Math.min(160, optionCount * 38 + 12) && above > below;
  return {
    left,
    width,
    ...(openAbove ? { bottom: viewportHeight - rect.top + 5 } : { top: rect.bottom + 5 }),
    maxHeight: openAbove ? above : below,
  };
}

export function CustomSelect({ label, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  function positionMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle(selectMenuPosition(rect, window.innerWidth, window.innerHeight, options.length));
  }

  function showMenu() {
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    positionMenu();
    setOpen(true);
  }

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const active = menu?.children[activeIndex] as HTMLElement | undefined;
    if (!open || !menu || !active) return;
    const top = active.offsetTop - menu.clientTop;
    if (top < menu.scrollTop + 5) menu.scrollTop = Math.max(0, top - 5);
    else if (top + active.offsetHeight > menu.scrollTop + menu.clientHeight - 5) {
      menu.scrollTop = top + active.offsetHeight - menu.clientHeight + 5;
    }
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromResize = () => setOpen(false);
    const closeFromPageScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("scroll", closeFromPageScroll, true);
    window.addEventListener("resize", closeFromResize);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("scroll", closeFromPageScroll, true);
      window.removeEventListener("resize", closeFromResize);
    };
  }, [open]);

  function handleKey(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") setOpen(false);
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) showMenu();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + options.length) % options.length);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        showMenu();
      } else {
        onChange(options[activeIndex].value);
        setOpen(false);
      }
    }
  }

  return (
    <div className="select" ref={rootRef}>
      <span className="select-label" id={`${menuId}-label`}>{label}</span>
      <button
        ref={triggerRef}
        className="select-trigger"
        type="button"
        role="combobox"
        aria-labelledby={`${menuId}-label ${menuId}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-activedescendant={open ? `${menuId}-option-${activeIndex}` : undefined}
        onClick={() => {
          if (open) setOpen(false);
          else showMenu();
        }}
        onKeyDown={handleKey}
      >
        <span id={`${menuId}-value`}>{selected.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="select-menu" ref={menuRef} id={menuId} role="listbox" aria-label={label} style={menuStyle}>
          {options.map((option, index) => (
            <button
              className={index === activeIndex ? "select-option is-active" : "select-option"}
              type="button"
              role="option"
              id={`${menuId}-option-${index}`}
              tabIndex={-1}
              aria-selected={option.value === value}
              key={option.value}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus({ preventScroll: true });
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
