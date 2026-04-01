import { Button } from "@tensamin/ui/cmp/button";
import { House, Phone } from "lucide-react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useCall } from "@tensamin/call/context";
import Wrapper from "@tensamin/user/wrapper";
import { Skeleton } from "@tensamin/ui/cmp/skeleton";
import { useConversation } from "@/features/conversation/context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@tensamin/ui/cmp/select";
import { displayCallId } from "@tensamin/call/utils";
import { useState } from "react";

export default function Navbar() {
  const navigate = useNavigate();
  const { joinCall, state } = useCall();
  const { conversations } = useConversation();

  const { pathname } = useLocation();
  const { id } = useSearch({ strict: false });

  const currentCalls = id ? conversations?.[id]?.calls || [] : [];
  //const currentCalls = ["leck", "schleck", "und", "eck"];

  const [selectOpen, setSelectOpen] = useState(false);

  return (
    <div className="w-full h-13.5 flex items-center justify-center">
      <Button
        onClick={() => navigate({ to: "/" })}
        className="w-9 h-9 aspect-square rounded-lg"
        variant="outline"
      >
        <House className="size-4.5" />
      </Button>
      {pathname === "/chat" && (
        <Wrapper
          userId={id}
          component={(user) => (
            <p className="font-medium pl-3 text-md">{user?.display}</p>
          )}
          loading={<Skeleton className="ml-3 w-40 h-5" />}
        />
      )}
      <div className="w-full" />
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
              className="w-9 h-9 aspect-square rounded-lg mr-2"
            >
              <Phone />
            </Button>
          ) : (
            <>
              <Button
                onClick={() => setSelectOpen((prev) => !prev)}
                className="w-9! h-9! aspect-square rounded-lg mr-2"
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
    </div>
  );
}
