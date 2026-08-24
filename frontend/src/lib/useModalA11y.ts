import { useEffect, useRef } from 'react';

// None of this app's modals (Settings, Achievements, Avatar Crop) had any
// keyboard/screen-reader affordances beyond a clickable backdrop and an X
// button - no Escape-to-close, and focus stayed wherever it was on the page
// behind the modal instead of moving into it, so a keyboard/screen-reader
// user opening a modal had no indication where they'd landed and no
// standard way out. This gives every modal that uses it: focus moved onto
// the dialog panel itself when it opens, Escape closes it, and focus
// restored to whatever triggered the modal when it closes.
export function useModalA11y(isOpen: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
    // onClose deliberately excluded - re-running this effect on every render
    // where the caller passes a fresh onClose closure (the common case) would
    // re-focus the panel and reset previouslyFocused on every keystroke inside
    // the modal, not just on real open/close transitions.
  }, [isOpen]);

  return panelRef;
}
