import { useState, type ReactNode } from "react";

import Sidebar from "@/components/sidebar";
import Navbar from "@/components/navbar";
import CallPopout from "@/components/callPopout";
import { useShowMobileNavbar } from "./useShowMobileNavbar";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  SidebarProvider,
  useIsMobile,
} from "@methanium/ui";
import { ShieldAlert } from "lucide-react";
import { useStorage } from "@tensamin/storage/context";
import { NavbarProvider } from "@tensamin/shared/navbar";

export default function Layout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const showMobileNavbar = useShowMobileNavbar();
  const { secureStorage } = useStorage();
  const [securityWarningDismissed, setSecurityWarningDismissed] =
    useState(false);

  return (
    <NavbarProvider>
      <div className="w-full h-full min-h-0 flex overflow-hidden bg-sidebar">
        <SidebarProvider className="h-full min-h-0 overflow-hidden">
          {!isMobile && <Sidebar />}
          <CallPopout />
          <AlertDialog
            open={secureStorage?.secure === false && !securityWarningDismissed}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <ShieldAlert />
                </AlertDialogMedia>
                <AlertDialogTitle>
                  Secure storage is unavailable
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {secureStorage?.secure === false && secureStorage.reason} Your
                  keyring and cached messages will get saved in regular storage.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  variant="default"
                  onClick={() => setSecurityWarningDismissed(true)}
                >
                  Dismiss
                </AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div
            data-app-layout
            className="w-full h-full min-h-0 flex flex-col overflow-hidden bg-background"
          >
            {(!isMobile || showMobileNavbar) && <Navbar forMobile={isMobile} />}
            <div className="bg-background min-h-0 flex-1 w-full overflow-hidden">
              {children}
            </div>
          </div>
        </SidebarProvider>
      </div>
    </NavbarProvider>
  );
}
