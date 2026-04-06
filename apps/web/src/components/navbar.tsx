import { Button } from "@tensamin/ui/cmp/button";
import { ArrowLeft, House, Phone, User } from "lucide-react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useCall } from "@tensamin/call/context";
import Wrapper from "@tensamin/user/wrapper";
import { Skeleton } from "@tensamin/ui/cmp/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@tensamin/ui/cmp/select";
import { displayCallId } from "@tensamin/call/utils";
import { useState } from "react";
import { SidebarTrigger, useSidebar } from "@tensamin/ui/cmp/sidebar";
import { useTTP } from "@tensamin/ttp/context";
import Controls from "@tensamin/tauri/controls";

export default function Navbar({ forMobile }: { forMobile: boolean }) {
  const navigate = useNavigate();
  const { joinCall, state } = useCall();
  const { contacts } = useTTP();

  const { pathname } = useLocation();
  const { id } = useSearch({ strict: false });

  const currentCalls = id ? contacts?.[id]?.calls || [] : [];
  //const currentCalls = ["leck", "schleck", "und", "eck"];

  const [selectOpen, setSelectOpen] = useState(false);

  return (
    <div
      data-tauri-drag-region
      className={`${forMobile && "border-b"} w-full gap-2 h-13.5 flex items-center justify-between`}
    >
      {forMobile ? (
        <SidebarTrigger
          className="w-9 h-9 aspect-square rounded-lg ml-2"
          variant="outline"
        >
          <ArrowLeft className="size-4.5" />
        </SidebarTrigger>
      ) : (
        <Button
          onClick={() => navigate({ to: "/" })}
          className="w-9 h-9 aspect-square rounded-lg"
          variant="outline"
        >
          <House className="size-4.5" />
        </Button>
      )}
      {pathname === "/chat" && (
        <Wrapper
          userId={id}
          component={(user) => (
            <p className="font-medium text-md">{user?.display}</p>
          )}
          loading={<Skeleton className="ml-3 w-40 h-5" />}
        />
      )}
      {/* Empty space */}
      {pathname === "/chat" && id && (
        <>
          {currentCalls.length === 0 ? (
            <Button
              disabled={state !== "closed"}
              onClick={() => {
                joinCall(id);
              }}
              className="w-9 h-9 aspect-square rounded-lg mr-2"
              variant="outline"
            >
              <Phone />
            </Button>
          ) : currentCalls.length === 1 ? (
            <Button
              disabled={state !== "closed"}
              onClick={() => {
                joinCall(id, currentCalls[0]);
              }}
              className="w-9 h-9 aspect-square rounded-lg"
            >
              <Phone />
            </Button>
          ) : (
            <>
              <Button
                onClick={() => setSelectOpen((prev) => !prev)}
                className="w-9! h-9! aspect-square rounded-lg"
              >
                <Phone />
              </Button>
              <Select onOpenChange={setSelectOpen} open={selectOpen}>
                <SelectTrigger hidden />
                <SelectContent>
                  {currentCalls.map((callId) => (
                    <SelectItem
                      value={callId}
                      key={callId}
                      onSelect={() => {
                        joinCall(id, callId);
                      }}
                    >
                      {displayCallId(callId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </>
      )}
      <Controls className="mr-2 ring-border" notPresentClassName="mr-2" />
    </div>
  );
}

export function MobileNavbar() {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();

  return (
    <div className="z-51 w-full pb-[env(safe-area-inset-bottom)] bg-card border-t">
      <div className="z-51 w-full h-14 flex justify-center items-center gap-8">
        <SidebarTrigger
          className="text-foreground w-12! h-12! aspect-square rounded-xl"
          variant="link"
        >
          <User className="size-5.5" />
        </SidebarTrigger>
        <Button
          onClick={() => {
            navigate({ to: "/" });
            setOpenMobile(false);
          }}
          className="text-foreground w-12 h-12 aspect-square rounded-xl"
          variant="link"
        >
          <House className="size-5.5" />
        </Button>
      </div>
    </div>
  );
}
