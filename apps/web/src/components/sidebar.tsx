import Wrapper from "@tensamin/user/wrapper";
import { Basic, Loading } from "./modals/basic";
import List from "@/features/conversation/list/body";

import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  useSidebar,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  DialogClose,
  Button,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@tensamin/ui";
import { isTauri } from "@tauri-apps/api/core";
import { useIsMobile } from "@tensamin/ui";
import { MobileNavbar } from "./navbar";

import SidebarBox from "@tensamin/call/sidebarBox";
import { useShowMobileNavbar } from "@/routes/app/useShowMobileNavbar";
import { Ellipsis, Check } from "lucide-react";
import { useState } from "react";
import type { User } from "@tensamin/user/context";
import type z from "zod";
import { mtp } from "@tensamin/shared/data";
import { useMTP } from "@tensamin/mtp";

type OnlineStatus = z.infer<
  typeof mtp.get_user_data.response.shape.online_status
>;

const onlineStatusLabels: Record<OnlineStatus, string> = {
  user_online: "Online",
  user_offline: "Offline",
  user_dnd: "Do not disturb",
  user_idle: "Idle",
  user_wc: "Away",
  user_borked: "Borked",
  iota_offline: "Iota offline",
  iota_online: "Iota online",
  iota_borked: "Iota borked",
};

function StatusDialog({
  user,
  open,
  onOpenChange,
  send,
  draftStatus,
  setDraftStatus,
  draftOnlineStatus,
  setDraftOnlineStatus,
  errorMessage,
  setErrorMessage,
  saveSucceeded,
  setSaveSucceeded,
}: {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  send: ReturnType<typeof useMTP>["send"];
  draftStatus: string;
  setDraftStatus: (value: string) => void;
  draftOnlineStatus: OnlineStatus;
  setDraftOnlineStatus: (value: OnlineStatus) => void;
  errorMessage: string;
  setErrorMessage: (value: string) => void;
  saveSucceeded: boolean;
  setSaveSucceeded: (value: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setDraftStatus(user.status ?? "");
          setDraftOnlineStatus(user.online_status);
          setErrorMessage("");
          setSaveSucceeded(false);
        }

        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Status</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="user-status">Status message</Label>
          <Input
            id="user-status"
            placeholder="Getting snacks..."
            value={draftStatus}
            onChange={(e) => {
              setSaveSucceeded(false);
              setErrorMessage("");
              setDraftStatus(e.target.value);
            }}
          />
          <Label htmlFor="user-online-status">Online status</Label>
          <Select
            value={draftOnlineStatus}
            onValueChange={(value) => {
              setSaveSucceeded(false);
              setErrorMessage("");
              setDraftOnlineStatus(value ?? "user_online");
            }}
          >
            <SelectTrigger className="w-full" id="user-online-status">
              <SelectValue placeholder="Online">
                {onlineStatusLabels[draftOnlineStatus]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="p-1">
              <SelectItem value="user_online">Online</SelectItem>
              <SelectItem value="user_offline">Offline</SelectItem>
              <SelectItem value="user_idle">Idle</SelectItem>
              <SelectItem value="user_dnd">Do not disturb</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="destructive">Cancel</Button>} />
          <Button
            onClick={async () => {
              const payload = {
                ...(draftStatus && { status: draftStatus }),
                online_status: draftOnlineStatus,
              };

              const validation =
                mtp.change_user_data.request.safeParse(payload);

              if (!validation.success) {
                setSaveSucceeded(false);
                setErrorMessage(
                  validation.error.issues[0]?.message ?? "Invalid status data",
                );
                return;
              }

              try {
                await send("change_user_data", validation.data);
                setSaveSucceeded(true);
                setErrorMessage("");
              } catch (err) {
                setSaveSucceeded(false);
                setErrorMessage("Failed to update status: " + err);
              }
            }}
          >
            {saveSucceeded ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-4" />
                Saved
              </span>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Sidebar() {
  const isMobile = useIsMobile();
  const showMobileNavbar = useShowMobileNavbar();
  const { openMobile, setOpenMobile } = useSidebar();
  const [draftStatus, setDraftStatus] = useState("");
  const [draftOnlineStatus, setDraftOnlineStatus] =
    useState<OnlineStatus>("user_online");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusErrorMessage, setStatusErrorMessage] = useState("");
  const [statusSaveSucceeded, setStatusSaveSucceeded] = useState(false);

  const { send } = useMTP();

  const content = (
    <>
      <SidebarContent
        className={
          isTauri() && isMobile ? "pt-[env(safe-area-inset-top)]" : "pt-2"
        }
      >
        <div className="h-full w-full flex flex-col gap-3 p-2 pt-0!">
          <div>
            <Wrapper
              loading={<Loading />}
              userId={"own"}
              component={(user) => (
                <>
                  <Basic
                    user={user}
                    extra={
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              aria-label="Open profile menu"
                              className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <Ellipsis />
                            </button>
                          }
                        />
                        <DropdownMenuContent>
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onClick={() => {
                                setDraftStatus(user.status ?? "");
                                setDraftOnlineStatus(user.online_status);
                                setStatusErrorMessage("");
                                setStatusSaveSucceeded(false);
                                setDialogOpen(true);
                              }}
                            >
                              Set Status
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                  <StatusDialog
                    user={user}
                    open={dialogOpen}
                    onOpenChange={(nextOpen) => {
                      if (!nextOpen) {
                        setDraftStatus(user.status ?? "");
                        setDraftOnlineStatus(user.online_status);
                        setStatusErrorMessage("");
                        setStatusSaveSucceeded(false);
                      }

                      setDialogOpen(nextOpen);
                    }}
                    send={send}
                    draftStatus={draftStatus}
                    setDraftStatus={setDraftStatus}
                    draftOnlineStatus={draftOnlineStatus}
                    setDraftOnlineStatus={setDraftOnlineStatus}
                    errorMessage={statusErrorMessage}
                    setErrorMessage={setStatusErrorMessage}
                    saveSucceeded={statusSaveSucceeded}
                    setSaveSucceeded={setStatusSaveSucceeded}
                  />
                </>
              )}
            />
          </div>
          <div className="h-full">
            <List />
          </div>
        </div>
      </SidebarContent>
      {isMobile && !showMobileNavbar && (
        <SidebarFooter className="p-0!">
          <MobileNavbar />
        </SidebarFooter>
      )}
      {!isMobile && (
        <SidebarFooter>
          <SidebarBox />
        </SidebarFooter>
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        {openMobile && (
          <div
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => setOpenMobile(false)}
          />
        )}
        <div
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="fixed inset-y-0 left-0 z-50 w-screen bg-sidebar p-0 text-sidebar-foreground transition-[transform,opacity] duration-150 ease-linear"
          style={{
            transform: openMobile ? "translateX(0)" : "translateX(-100%)",
            opacity: openMobile ? 1 : 0,
            pointerEvents: openMobile ? "auto" : "none",
          }}
        >
          <div className="flex h-full w-full flex-col">{content}</div>
        </div>
      </>
    );
  }

  return <SidebarRoot className="border-0!">{content}</SidebarRoot>;
}
