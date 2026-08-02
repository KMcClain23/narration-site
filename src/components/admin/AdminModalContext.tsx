"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Counter-based rather than a single boolean — CardEditModal's Archive-confirm
// renders nested inside the still-mounted CardEditModal, but that's fine as
// written below (the parent's single registration already covers its whole
// mounted lifetime). The counter exists for the general case: any two modals
// that could independently open/close without one unmounting the other
// shouldn't be able to clobber each other's "closed" signal.
type ModalContextValue = { isAnyModalOpen: boolean; registerModalOpen: () => () => void };

const ModalContext = createContext<ModalContextValue | null>(null);

export function AdminModalProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const registerModalOpen = useCallback(() => {
    setCount(c => c + 1);
    return () => setCount(c => c - 1);
  }, []);
  const value = useMemo(() => ({ isAnyModalOpen: count > 0, registerModalOpen }), [count, registerModalOpen]);

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

// Call with the modal's own open/mounted condition — registers while true,
// unregisters when it flips false or the component unmounts. Works whether
// the caller conditionally mounts (pass `true` unconditionally) or toggles
// an internal `open` state while staying mounted (pass that state through).
export function useModalOpen(isOpen: boolean) {
  const ctx = useContext(ModalContext);
  useEffect(() => {
    if (!isOpen || !ctx) return;
    return ctx.registerModalOpen();
  }, [isOpen, ctx]);
}

export function useIsAnyModalOpen(): boolean {
  const ctx = useContext(ModalContext);
  return ctx?.isAnyModalOpen ?? false;
}
