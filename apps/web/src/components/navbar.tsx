import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useIsMobile,
} from "@tensamin/ui";
import { ArrowLeft, House, Phone, Settings, User } from "lucide-react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { joinCall, useCall } from "@tensamin/call/store";
import Wrapper from "@tensamin/user/wrapper";
import { Skeleton } from "@tensamin/ui";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@tensamin/ui";
import { displayCallId } from "@tensamin/call/utils";
import { useState } from "react";
import { SidebarTrigger, useSidebar } from "@tensamin/ui";
import { WindowControls as Controls } from "@tensamin/ui";
import { useSession } from "@tensamin/storage/session";
import Profile from "./modals/profile";

export default function Navbar({ forMobile }: { forMobile: boolean }) {
  const navigate = useNavigate();
  const callState = useCall((state) => state.state);
  const { calls } = useSession();

  const { pathname } = useLocation();

  const { id } = useSearch({ strict: false });

  const currentCalls = calls.filter((call) =>
    call.CallMembers.some((member) => member === id),
  );

  const isMobile = useIsMobile();

  const [userInfoOpen, setUserInfoOpen] = useState(false);

  return (
    <div
      data-tauri-drag-region
      className={`${forMobile && "border-b"} w-full shrink-0 gap-2 h-13.5 flex items-center justify-between`}
    >
      <div className="flex items-center justify-center gap-2">
        {forMobile ? (
          <SidebarTrigger
            className="w-9 h-9 aspect-square rounded-lg ml-2"
            variant="outline"
          >
            <ArrowLeft className="size-4.5" />
          </SidebarTrigger>
        ) : (
          <>
            <Button
              onClick={() => navigate({ to: "/" })}
              className="w-9 h-9 aspect-square rounded-lg"
              variant="outline"
            >
              <House className="size-4.5" />
            </Button>
            <Button
              // @ts-expect-error TanStack router doesn't properly detect the settings route
              onClick={() => navigate({ to: "/settings" })}
              className="w-9 h-9 aspect-square rounded-lg"
              variant="outline"
            >
              <Settings className="size-4.5" />
            </Button>
          </>
        )}
        {pathname === "/chat" && id && (
          <Wrapper
            userId={id}
            component={(user) =>
              isMobile ? (
                <p className="font-medium text-[1.07rem]">{user?.Display}</p>
              ) : (
                <Popover open={userInfoOpen} onOpenChange={setUserInfoOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="link"
                        className="px-0! text-foreground"
                        style={{
                          textDecorationLine: "none",
                        }}
                      >
                        <p className="font-medium text-[1.07rem]">
                          {user?.Display}
                        </p>
                      </Button>
                    }
                  />
                  <PopoverContent side="bottom">
                    <Profile user={user} />
                  </PopoverContent>
                </Popover>
              )
            }
            loading={<Skeleton className="w-30 h-5" />}
          />
        )}
      </div>
      {/* Empty space */}
      <div className="flex items-center justify-center gap-2">
        {pathname === "/chat" && id && (
          <>
            {currentCalls.length === 0 ? (
              <Button
                disabled={callState !== "closed"}
                onClick={() => {
                  void joinCall(id);
                }}
                className="w-9 h-9 aspect-square rounded-lg"
                variant="outline"
              >
                <Phone />
              </Button>
            ) : currentCalls.length === 1 ? (
              <Button
                disabled={callState !== "closed"}
                onClick={() => {
                  void joinCall(
                    id,
                    currentCalls[0].CallSecret,
                    currentCalls[0].CallId,
                  );
                }}
                className="w-9 h-9 aspect-square rounded-lg"
              >
                <Phone />
              </Button>
            ) : (
              <>
                <Select>
                  <SelectTrigger
                    // eslint-disable-next-line
                    render={({ className, ...props }) => (
                      <Button
                        {...props}
                        className="w-9! h-9! aspect-square rounded-lg px-0! flex! justify-center!"
                        variant="default"
                      >
                        <Phone />
                      </Button>
                    )}
                  />
                  <SelectContent className="p-1">
                    {currentCalls.map((call) => (
                      <SelectItem
                        value={call.CallId}
                        key={call.CallId}
                        onSelect={() => {
                          void joinCall(id, call.CallSecret, call.CallId);
                        }}
                      >
                        {displayCallId(call.CallId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </>
        )}
        <Controls className="mr-2" />
      </div>
    </div>
  );
}

export function MobileNavbar() {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();

  return (
    <div className="z-51 w-full shrink-0 pb-[env(safe-area-inset-bottom)] bg-card border-t">
      <div className="z-51 w-full h-15 grid grid-cols-3 items-center place-items-center px-5">
        <SidebarTrigger
          className="text-foreground w-12! h-12! aspect-square rounded-xl flex flex-col gap-1"
          variant="link"
        >
          <User className="size-4.5" />
          <p className="text-xs">Chats</p>
        </SidebarTrigger>
        <Button
          onClick={() => {
            navigate({ to: "/" });
            setOpenMobile(false);
          }}
          className="text-foreground w-12 h-12 aspect-square rounded-xl flex flex-col gap-1"
          variant="link"
        >
          <House className="size-4.5" />
          <p className="text-xs">Home</p>
        </Button>
        <Button
          onClick={() => {
            // @ts-expect-error TanStack router doesn't properly detect the settings route
            navigate({ to: "/settings" });
            setOpenMobile(false);
          }}
          className="text-foreground w-12 h-12 aspect-square rounded-xl flex flex-col gap-1"
          variant="link"
        >
          <Settings className="size-4.5" />
          <p className="text-xs">Settings</p>
        </Button>
      </div>
    </div>
  );
}
