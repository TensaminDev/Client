import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import Sidebar from "@/components/sidebar";
import Navbar from "@/components/navbar";
import { useStorage } from "@tensamin/storage/context";

import { motion } from "framer-motion";

/**
 * Executes Layout.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Layout(props: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  const { load } = useStorage();

  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    void load("user_id").then((userId) => {
      if (!active) {
        return;
      }

      if (userId !== 0) {
        setLoggedIn(true);
        return;
      }

      setLoggedIn(false);
      void navigate({
        to: "/login",
      });
    });

    return () => {
      active = false;
    };
  }, [load, navigate]);

  if (loggedIn !== true) {
    return null;
  }

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
