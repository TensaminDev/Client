import { type ReactNode } from "react";

import Sidebar from "@/components/sidebar";
import Navbar from "@/components/navbar";

import { motion } from "framer-motion";

/**
 * Executes Layout.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Layout(props: { children: ReactNode }) {
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
      <Sidebar />
      <div className="w-full h-full flex flex-col">
        <Navbar />
        <div className="bg-background h-full w-full rounded-tl-3xl border-t border-l">
          {props.children}
        </div>
      </div>
    </motion.div>
  );
}

const animationTiming = {
  first: 0.18,
  second: 0.1,
};
