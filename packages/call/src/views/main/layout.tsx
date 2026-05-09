import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Actions from "../../components/actions";
import TopBar from "../../components/top";
import { setScreenRef, useCall } from "../../store";

export default function Layout({ children }: { children: React.ReactNode }) {
  const screenRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const hideChromeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [overlayInsets, setOverlayInsets] = useState({ top: 0, bottom: 0 });
  const [isImmersiveChromeVisible, setIsImmersiveChromeVisible] =
    useState(false);

  useEffect(() => {
    setScreenRef(screenRef);
  }, []);

  const usersInFocusedViewHidden = useCall(
    (state) => state.usersInFocusedViewHidden,
  );
  const view = useCall((state) => state.view);
  const callIsFullscreen = useCall((state) => state.callIsFullscreen);
  const isImmersiveFocusedView =
    callIsFullscreen && view === "focused" && usersInFocusedViewHidden;
  const immersiveChromeVisible =
    isImmersiveFocusedView && isImmersiveChromeVisible;

  useEffect(() => {
    if (!isImmersiveFocusedView) {
      if (hideChromeTimeoutRef.current) {
        clearTimeout(hideChromeTimeoutRef.current);
        hideChromeTimeoutRef.current = null;
      }
    }
  }, [isImmersiveFocusedView]);

  useEffect(() => {
    return () => {
      if (hideChromeTimeoutRef.current) {
        clearTimeout(hideChromeTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const topBar = topBarRef.current;
    const actions = actionsRef.current;

    if (!topBar || !actions) {
      return;
    }

    const syncOverlayInsets = () => {
      setOverlayInsets({
        top: Math.ceil(topBar.getBoundingClientRect().height),
        bottom: Math.ceil(actions.getBoundingClientRect().height),
      });
    };

    syncOverlayInsets();

    const observer = new ResizeObserver(syncOverlayInsets);
    observer.observe(topBar);
    observer.observe(actions);

    return () => {
      observer.disconnect();
    };
  }, []);

  const scheduleChromeHide = () => {
    if (hideChromeTimeoutRef.current) {
      clearTimeout(hideChromeTimeoutRef.current);
    }

    hideChromeTimeoutRef.current = setTimeout(() => {
      setIsImmersiveChromeVisible(false);
      hideChromeTimeoutRef.current = null;
    }, 3000);
  };

  const showImmersiveChrome = () => {
    if (!isImmersiveFocusedView) {
      return;
    }

    setIsImmersiveChromeVisible(true);
    scheduleChromeHide();
  };

  const hideImmersiveChrome = () => {
    if (hideChromeTimeoutRef.current) {
      clearTimeout(hideChromeTimeoutRef.current);
      hideChromeTimeoutRef.current = null;
    }

    setIsImmersiveChromeVisible(false);
  };

  return (
    <div
      ref={screenRef}
      className={`relative w-full h-full flex flex-col ${
        isImmersiveFocusedView && !immersiveChromeVisible ? "cursor-none" : ""
      } ${callIsFullscreen ? "bg-background" : ""}`}
      onMouseEnter={showImmersiveChrome}
      onMouseMove={showImmersiveChrome}
      onMouseLeave={hideImmersiveChrome}
    >
      <div
        ref={topBarRef}
        className={`shrink-0 w-full z-40 transition-all duration-200 ${
          isImmersiveFocusedView
            ? immersiveChromeVisible
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 -translate-y-2 pointer-events-none"
            : "opacity-100 translate-y-0"
        }`}
        style={{
          position: usersInFocusedViewHidden ? "absolute" : "relative",
          top: 0,
          left: 0,
        }}
      >
        <TopBar />
      </div>
      <div
        className="min-h-0 flex-1 w-full flex justify-center items-center overflow-hidden"
        style={
          usersInFocusedViewHidden && !isImmersiveFocusedView
            ? {
                paddingTop: overlayInsets.top,
                paddingBottom: overlayInsets.bottom,
              }
            : undefined
        }
      >
        {children}
      </div>
      <div
        ref={actionsRef}
        className={`shrink-0 pb-4.5 pt-3 bottom-0 w-full z-40 transition-all duration-200 ${
          isImmersiveFocusedView
            ? immersiveChromeVisible
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-2 pointer-events-none"
            : "opacity-100 translate-y-0"
        }`}
        style={{
          position: usersInFocusedViewHidden ? "absolute" : "relative",
          left: 0,
        }}
      >
        <Actions />
      </div>
    </div>
  );
}
