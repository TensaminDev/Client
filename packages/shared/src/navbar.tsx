import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type ReactPortal,
} from "react";
import { createPortal } from "react-dom";

const NavbarContext = createContext<{
  render: (children: ReactNode) => ReactPortal | null;
  setTarget: (target: HTMLDivElement | null) => void;
  topPadding: boolean;
  setTopPadding: (value: boolean | null) => void;
} | null>(null);

export function useNavbar() {
  const context = useContext(NavbarContext);
  if (!context)
    throw new Error("useNavbar must be used within NavbarProvider.");
  return context;
}

export function NavbarProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [hasCenterContent, setHasCenterContent] = useState(false);
  const [override, setOverride] = useState<boolean | null>(null);

  const render = useCallback(
    (children: ReactNode) => (target ? createPortal(children, target) : null),
    [target],
  );

  const setTopPadding = useCallback(
    (value: boolean | null) => setOverride(value),
    [],
  );

  useEffect(() => {
    if (!target) {
      setHasCenterContent(false);
      return;
    }

    const update = () => setHasCenterContent(target.childElementCount > 0);
    const observer = new MutationObserver(update);
    observer.observe(target, { childList: true, subtree: true });
    update();

    return () => observer.disconnect();
  }, [target]);

  const topPadding = override ?? hasCenterContent;

  return (
    <NavbarContext.Provider
      value={useMemo(
        () => ({ render, setTarget, topPadding, setTopPadding }),
        [render, topPadding, setTopPadding],
      )}
    >
      {children}
    </NavbarContext.Provider>
  );
}

export function NavbarTarget(props: ComponentPropsWithoutRef<"div">) {
  const { setTarget } = useNavbar();
  return <div ref={setTarget} {...props} />;
}
