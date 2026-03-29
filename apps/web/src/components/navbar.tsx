import { Button } from "@tensamin/ui/cmp/button";
import { House, Phone } from "lucide-react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useCall } from "@tensamin/call/context";
import Wrapper from "@tensamin/user/wrapper";
import { Skeleton } from "@tensamin/ui/cmp/skeleton";
import { useConversation } from "@/features/conversation/context";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@tensamin/ui/cmp/select";
import { displayCallId } from "@tensamin/call/utils";

export default function Navbar() {
  const navigate = useNavigate();
  const { joinCall, state } = useCall();
  const { conversations } = useConversation();

  const { pathname } = useLocation();
  const { id } = useSearch({ strict: false });

  const currentCalls = id ? conversations?.[id]?.calls || [] : [];

  return (
    <div className="w-full h-13.5 flex items-center justify-center">
      <Button
        onClick={() => navigate({ to: "/" })}
        className="w-9 h-9 aspect-square rounded-lg"
        variant="outline"
      >
        <House className="size-4.5" />
      </Button>
      {pathname === "/app/chat" && (
        <Wrapper
          userId={id}
          component={(user) => (
            <p className="font-medium pl-3 text-md">{user?.display}</p>
          )}
          loading={<Skeleton className="ml-3 w-40 h-5" />}
        />
      )}
      <div className="w-full" />
      {pathname === "/app/chat" && id && (
        <>
          {currentCalls.length > 0 ? (
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
            <Select>
              <SelectTrigger
                render={
                  <Button className="w-9 h-9 aspect-square rounded-lg mr-2">
                    <Phone />
                  </Button>
                }
              />
              <SelectContent>
                {currentCalls.map((callId) => (
                  <SelectItem
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
          )}
        </>
      )}
    </div>
  );
}
