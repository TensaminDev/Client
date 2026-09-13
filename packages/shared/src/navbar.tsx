import {
  createContext,
  useCallback,
  useContext,
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
} | null>(null);

export function useNavbar() {
  const context = useContext(NavbarContext);
  if (!context)
    throw new Error("useNavbar must be used within NavbarProvider.");
  return context;
}

export function NavbarProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const render = useCallback(
    (children: ReactNode) => (target ? createPortal(children, target) : null),
    [target],
  );

  return (
    <NavbarContext.Provider
      value={useMemo(() => ({ render, setTarget }), [render])}
    >
      {children}
    </NavbarContext.Provider>
  );
}

export function NavbarTarget(props: ComponentPropsWithoutRef<"div">) {
  const { setTarget } = useNavbar();
  return <div ref={setTarget} {...props} />;
}
