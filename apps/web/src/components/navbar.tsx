import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useIsMobile,
} from "@methanium/ui";
import {
  ArrowLeft,
  EllipsisVertical,
  House,
  Phone,
  Settings,
} from "lucide-react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useCall } from "@tensamin/call/state";
import Wrapper from "@tensamin/identity/wrapper";
import { Skeleton } from "@methanium/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@methanium/ui";
import { displayCallId } from "@tensamin/call/utils";
import { useState } from "react";
import { WindowControls as Controls } from "@methanium/ui";
import { useSession } from "@tensamin/identity/session";
import { joinCall } from "@tensamin/call/store";
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

  const { callId } = useCall();

  return (
    <div
      data-tauri-drag-region
      data-pwa-navbar
      className={`${forMobile && "border-b"} pl-px w-full shrink-0 gap-2 h-13.5 flex items-center justify-between`}
    >
      <div className="flex items-center justify-center gap-2">
        {forMobile ? (
          <Button
            onClick={() => void navigate({ to: "/" })}
            className="w-9 h-9! ml-2"
            variant="ghost"
          >
            <ArrowLeft className="size-4.5" />
          </Button>
        ) : (
          <>
            <Button
              onClick={() => navigate({ to: "/" })}
              className="w-9 h-9! aspect-square rounded-lg"
              variant="ghost"
            >
              <House className="size-4.5" />
            </Button>
            <Button
              onClick={() => navigate({ to: "/settings" })}
              className="w-9 h-9! aspect-square rounded-lg"
              variant="ghost"
            >
              <Settings className="size-4.5" />
            </Button>
          </>
        )}
        {isMobile && pathname === "/call" && callId && (
          <p className="font-medium text-[1.07rem]">{displayCallId(callId)}</p>
        )}
        {pathname === "/chat" && id && (
          <Wrapper
            userId={id}
            fields={[
              "UserId",
              "Display",
              "Username",
              "Avatar",
              "About",
              "IotaId",
              "PublicKey",
            ]}
            component={(user) =>
              isMobile ? (
                <p className="font-medium text-[1.07rem]">{user?.Display}</p>
              ) : (
                <Popover open={userInfoOpen} onOpenChange={setUserInfoOpen}>
                  <PopoverTrigger
                    render={({ onClick }) => (
                      <Button
                        onClick={onClick}
                        variant="link"
                        className="text-foreground! px-0! border-0! bg-none! bg-transparent!"
                        style={{
                          textDecorationLine: "none",
                        }}
                      >
                        <p className="font-medium text-[1.07rem]">
                          {user?.Display}
                        </p>
                      </Button>
                    )}
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
                onClick={() => void joinCall(id)}
                className="w-9 h-9! aspect-square rounded-lg"
                variant="ghost"
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
                    true,
                    currentCalls[0].OmikronId,
                  );
                }}
                className="w-9 h-9! aspect-square rounded-lg"
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
                        onSelect={() =>
                          void joinCall(
                            id,
                            call.CallSecret,
                            call.CallId,
                            true,
                            call.OmikronId,
                          )
                        }
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
        {isMobile && pathname === "/call" && callId && (
          <Button variant="ghost">
            <EllipsisVertical />
          </Button>
        )}
        <Controls className="mr-2" />
      </div>
    </div>
  );
}
