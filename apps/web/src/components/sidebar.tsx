import Wrapper from "@tensamin/identity/wrapper";
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
} from "@methanium/ui";
import { useIsMobile } from "@methanium/ui";
import { MobileNavbar } from "./navbar";

import SidebarBox from "@tensamin/call/sidebarBox";
import { useShowMobileNavbar } from "@/routes/app/useShowMobileNavbar";
import { Ellipsis, Check } from "lucide-react";
import { useState } from "react";
import { useUser, type User } from "@tensamin/identity/context";
import { mtp, userPresencePreferenceSchema } from "@tensamin/shared/data";
import { useMTP } from "@tensamin/mtp";
import {
  onlineStatusLabels,
  onlineStatusOptions,
  type OnlineStatus,
} from "./status-options";

function accountPreference(status: User["OnlineStatus"]): OnlineStatus {
  return userPresencePreferenceSchema.safeParse(status).success
    ? (status as OnlineStatus)
    : "user_online";
}

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
  user: Pick<User, "UserId" | "OnlineStatus" | "Status">;
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
  const { updateProfile, updateState } = useUser();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setDraftStatus(user.Status ?? "");
          setDraftOnlineStatus(accountPreference(user.OnlineStatus));
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
              {onlineStatusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
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
              const validation = mtp.ChangeUserData.request.safeParse({
                OnlineStatus: draftOnlineStatus,
                Status: draftStatus,
              });

              if (!validation.success) {
                setSaveSucceeded(false);
                setErrorMessage(
                  validation.error.issues[0]?.message ?? "Invalid status data",
                );
                return;
              }

              try {
                await send("ChangeUserData", validation.data);
                updateState(user.UserId, draftOnlineStatus);
                await updateProfile(user.UserId, { Status: draftStatus });
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
      <SidebarContent className="pt-2">
        <div className="h-full w-full flex flex-col gap-3 p-2 pt-0!">
          <div>
            <Wrapper
              loading={<Loading />}
              userId={"own"}
              fields={[
                "UserId",
                "Display",
                "Username",
                "Avatar",
                "OnlineStatus",
                "Status",
              ]}
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
                                setDraftStatus(user.Status ?? "");
                                setDraftOnlineStatus(
                                  accountPreference(user.OnlineStatus),
                                );
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
                        setDraftStatus(user.Status ?? "");
                        setDraftOnlineStatus(
                          accountPreference(user.OnlineStatus),
                        );
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
          className="fixed inset-y-0 left-0 z-50 w-screen bg-sidebar pt-[var(--ui-safe-area-top)] pr-[var(--ui-safe-area-right)] pl-[var(--ui-safe-area-left)] text-sidebar-foreground"
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
