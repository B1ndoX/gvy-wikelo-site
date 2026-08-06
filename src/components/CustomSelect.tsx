import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

export type SelectOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
};

export function CustomSelect({ label, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  function positionMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const availableWidth = Math.max(rect.width, window.innerWidth - rect.left - 8);
    setMenuStyle({
      left: rect.left,
      top: rect.bottom + 5,
      width: Math.min(Math.max(rect.width, 190), availableWidth),
      maxHeight: Math.max(80, window.innerHeight - rect.bottom - 13),
    });
  }

  function showMenu() {
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    positionMenu();
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromResize = () => setOpen(false);
    document.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("resize", closeFromResize);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("resize", closeFromResize);
    };
  }, [open]);

  function handleKey(event: React.KeyboardEvent<HTMLButtonElement>) {
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
      <span className="select-label">{label}</span>
      <button
        ref={triggerRef}
        className="select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (open) setOpen(false);
          else showMenu();
        }}
        onKeyDown={handleKey}
      >
        <span>{selected.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="select-menu" id={menuId} role="listbox" aria-label={label} style={menuStyle}>
          {options.map((option, index) => (
            <button
              className={index === activeIndex ? "select-option is-active" : "select-option"}
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
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
