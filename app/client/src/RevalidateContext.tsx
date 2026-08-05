// Lets the header's "Re-read files" button call whichever page is currently
// mounted's revalidate(). Each page registers its own revalidate on mount and
// clears it on unmount; the header just calls whatever's registered.
import { createContext, useContext, useEffect } from 'react';

type Setter = (fn: (() => void) | null) => void;

export const RevalidateContext = createContext<Setter>(() => {});

export function useRegisterRevalidate(revalidate: () => void): void {
  const setRevalidate = useContext(RevalidateContext);
  useEffect(() => {
    setRevalidate(revalidate);
    return () => setRevalidate(null);
  }, [revalidate, setRevalidate]);
}
