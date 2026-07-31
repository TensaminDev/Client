import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  setCallIsFullscreen,
  setCallIsPopout,
  triggerCallLayoutCalculation,
  useCall,
} from "./store";

import MainLayout from "./views/main/layout";
import MainGrid from "./views/main/grid";
import MainFocused from "./views/main/focused";
import Preview from "./views/preview";

function ScreenContent() {
  const view = useCall((state) => state.view);

  return view === "preview" ? (
    <Preview />
  ) : (
    <MainLayout>{view === "grid" ? <MainGrid /> : <MainFocused />}</MainLayout>
  );
}

// Popout Window
function copyDocumentStyles(targetDocument: Document) {
  for (const node of document.querySelectorAll(
    'link[rel="stylesheet"], style',
  )) {
    targetDocument.head.appendChild(node.cloneNode(true));
  }
}

function syncDocumentAttributes(targetDocument: Document) {
  for (const attribute of document.documentElement.attributes) {
    targetDocument.documentElement.setAttribute(
      attribute.name,
      attribute.value,
    );
  }
  targetDocument.body.className = document.body.className;
}

function PopoutScreen() {
  const closeCheckRef = useRef<number | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const popoutWindow = window.open(
      "",
      "tensamin-call-popout",
      "popup,width=1280,height=720",
    );

    if (!popoutWindow) {
      setCallIsFullscreen(false);
      setCallIsPopout(false);
      return;
    }

    let isMounted = true;

    popoutWindow.document.title = document.title;
    popoutWindow.document.body.innerHTML = "";
    popoutWindow.document.body.style.margin = "0";
    copyDocumentStyles(popoutWindow.document);
    syncDocumentAttributes(popoutWindow.document);

    popoutWindow.document.documentElement.style.height = "100%";
    popoutWindow.document.body.style.height = "100%";

    const containerElement = popoutWindow.document.createElement("div");
    containerElement.style.width = "100%";
    containerElement.style.height = "100%";
    popoutWindow.document.body.appendChild(containerElement);
    queueMicrotask(() => {
      if (isMounted) {
        setContainer(containerElement);
      }
    });

    const closePopout = () => {
      setCallIsFullscreen(false);
      setCallIsPopout(false);
    };
    const syncLayout = () => triggerCallLayoutCalculation();

    popoutWindow.addEventListener("beforeunload", closePopout);
    popoutWindow.addEventListener("resize", syncLayout);
    popoutWindow.focus();

    closeCheckRef.current = window.setInterval(() => {
      if (popoutWindow.closed) {
        closePopout();
      }
    }, 500);

    triggerCallLayoutCalculation();

    return () => {
      isMounted = false;
      popoutWindow.removeEventListener("beforeunload", closePopout);
      popoutWindow.removeEventListener("resize", syncLayout);

      if (closeCheckRef.current) {
        window.clearInterval(closeCheckRef.current);
        closeCheckRef.current = null;
      }

      if (!popoutWindow.closed) {
        popoutWindow.close();
      }

      setCallIsFullscreen(false);
      triggerCallLayoutCalculation();
    };
  }, []);

  if (!container) {
    return null;
  }

  return createPortal(<ScreenContent />, container);
}

export default function Screen() {
  const callIsPopout = useCall((state) => state.callIsPopout);

  return callIsPopout ? (
    <div className="flex justify-center items-center h-full w-full">
      <p>The window is popped out.</p>
      <PopoutScreen />
    </div>
  ) : (
    <ScreenContent />
  );
}
