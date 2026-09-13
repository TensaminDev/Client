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
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { WindowControls as Controls } from "@methanium/ui";
import { useSession } from "@tensamin/identity/session";
import { joinCall } from "@tensamin/call/store";
import { SettingsProfileMenu } from "@tensamin/settings";
import Profile from "./modals/profile";

function NavbarSection({
  children,
  side,
}: {
  children: ReactNode;
  side: "left" | "right";
}) {
  const content = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    if (!content.current) return;

    const element = content.current;
    const updateWidth = () => setWidth(element.scrollWidth);
    const resizeObserver = new ResizeObserver(updateWidth);
    const mutationObserver = new MutationObserver(updateWidth);

    resizeObserver.observe(element);
    mutationObserver.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    updateWidth();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  const edgeWidth = 18;
  const edgeReserve = 18;

  return (
    <div
      className="relative z-10 h-12 min-w-0 shrink-0 overflow-hidden"
      style={{ width: width == null ? 0 : width + edgeReserve }}
    >
      <div
        className="absolute inset-y-0 z-0 border-b border-(--border)/40 bg-sidebar"
        style={
          side === "left"
            ? { left: 0, right: edgeWidth }
            : { right: 0, left: edgeWidth }
        }
      />

      <svg
        aria-hidden="true"
        className={`pointer-events-none absolute top-0 z-1 h-12 ${
          side === "left" ? "right-0 -scale-x-100" : "left-0"
        }`}
        style={{ width: edgeWidth }}
        viewBox="0 0 18 48"
      >
        <path
          d="
            M0 0
            V6.5
            C1.2 6.5 2 7 3 8
            C4.5 9.5 7.2 22.05 9 27
            C10.8 31.95 13.5 44.5 15 46
            C16 47 16.8 47.5 18 47.5
            V0
            Z
          "
          fill="var(--sidebar)"
        />

        <path
          d="
            M0 6.5
            C1.2 6.5 2 7 3 8
            C4.5 9.5 7.2 22.05 9 27
            C10.8 31.95 13.5 44.5 15 46
            C16 47 16.8 47.5 18 47.5
          "
          fill="none"
          className="opacity-40"
          stroke="var(--border)"
          strokeWidth="1"
          strokeLinecap="butt"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        ref={content}
        className="relative z-10 flex h-full w-max items-center gap-2"
        style={side === "right" ? { marginLeft: edgeReserve } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export default function Navbar({
  forMobile,
  children,
}: {
  forMobile: boolean;
  children?: ReactNode;
}) {
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
      className="relative flex h-13.5 w-full shrink-0 items-start justify-between"
    >
      <div className="absolute inset-x-0 top-0 h-[7px] border-b border-(--border)/40 bg-sidebar" />
      <NavbarSection side="left">
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
                        <p className="font-medium text-[1.07rem] pr-1">
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
      </NavbarSection>
      <div className="pointer-events-none relative z-20 flex h-full min-w-0 flex-1 items-center justify-start [&>*]:pointer-events-auto">
        {children}
        {!forMobile && pathname.startsWith("/settings") && (
          <div className="translate-y-[3.5px] [&>div]:w-auto">
            <SettingsProfileMenu />
          </div>
        )}
      </div>
      <NavbarSection side="right">
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
      </NavbarSection>
    </div>
  );
}
