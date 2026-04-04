import { type ReactNode } from "react";

import Sidebar from "@/components/sidebar";
import Navbar, { MobileNavbar } from "@/components/navbar";

import { SidebarProvider } from "@tensamin/ui/cmp/sidebar";
import { useIsMobile, cn } from "@tensamin/ui/utils";

import { motion } from "framer-motion";

/**
 * Executes Layout.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Layout(props: { children: ReactNode }) {
  const isMobile = useIsMobile();

  return (
    <motion.div
      className="w-full h-full flex bg-sidebar"
      initial={{ y: -40, scale: 0.95, borderRadius: "1rem" }}
      animate={{ y: 0, scale: 1, borderRadius: 0 }}
      transition={{
        borderRadius: { duration: animationTiming.first, ease: "easeOut" },
        y: { duration: animationTiming.first, ease: "easeOut" },
        scale: {
          delay: animationTiming.first,
          duration: animationTiming.second,
          ease: "easeOut",
        },
      }}
    >
      <SidebarProvider>
        <Sidebar />
        <div className="w-full h-full flex flex-col">
          {!isMobile && <Navbar />}
          <div
            className={cn(
              "bg-background h-full w-full",
              !isMobile && "rounded-tl-3xl border-t border-l",
            )}
          >
            {props.children}
          </div>
          {isMobile && <MobileNavbar />}
        </div>
      </SidebarProvider>
    </motion.div>
  );
}

const animationTiming = {
  first: 0.18,
  second: 0.1,
};
