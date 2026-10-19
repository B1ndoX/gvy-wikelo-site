import { useLayoutEffect, useRef } from "react";

const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// One focus boundary for the top layer; keep each opener for nested dialog returns.
export function useDialogFocus(dialogKey: string | null) {
  const stack = useRef<{ dialog: HTMLElement; opener: HTMLElement | null }[]>([]);

  useLayoutEffect(() => {
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('.app-shell [role="dialog"]'));
    const dialog = dialogs.at(-1);
    let returnTarget: HTMLElement | null = null;
    while (stack.current.length && !stack.current.at(-1)!.dialog.isConnected) {
      returnTarget = stack.current.pop()!.opener;
    }
    if (!dialog) {
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
      return;
    }
    if (!stack.current.some((entry) => entry.dialog === dialog)) {
      stack.current.push({ dialog, opener: returnTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null) });
    }

    // Hide only sibling surfaces, never an ancestor of the active dialog.
    const background = Array.from(document.querySelector(".app-shell")!.children)
      .filter((element) => !element.contains(dialog));
    const previous = background.map((element) => ({ element, inert: element.getAttribute("inert"), hidden: element.getAttribute("aria-hidden") }));
    background.forEach((element) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
      const style = getComputedStyle(element);
      return element.tabIndex >= 0 && !element.closest("[hidden], [inert]") && style.display !== "none" && style.visibility !== "hidden";
    });
    const focusFirst = () => (focusable()[0] ?? dialog).focus({ preventScroll: true });
    if (returnTarget?.isConnected && dialog.contains(returnTarget)) returnTarget.focus({ preventScroll: true });
    else if (!dialog.contains(document.activeElement)) focusFirst();

    const keepFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) focusFirst();
    };
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !dialog.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last ?? dialog : first ?? dialog).focus();
      }
    };
    document.addEventListener("focusin", keepFocus);
    document.addEventListener("keydown", handleTab);
    return () => {
      document.removeEventListener("focusin", keepFocus);
      document.removeEventListener("keydown", handleTab);
      previous.forEach(({ element, inert, hidden }) => {
        if (inert === null) element.removeAttribute("inert");
        else element.setAttribute("inert", inert);
        if (hidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", hidden);
      });
    };
  }, [dialogKey]);
}
