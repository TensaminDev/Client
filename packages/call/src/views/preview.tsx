import { useCall } from "../store";
import type { CurrentCallData } from "../state";
import { useUserFields } from "@tensamin/identity/context";

const USER_FIELDS = ["Display"] as const;
const STATUS_MESSAGES: Record<CurrentCallData["status"], string | null> = {
  loading: null,
  ready: null,
  "not-found": "Call expired",
  forbidden: "You do not have access to this call",
  error: "Unable to load call",
};

function Participant({ userId }: { userId: number }) {
  const { data: user } = useUserFields(userId, USER_FIELDS);
  return user ? <p className="text-2xl">User: {user.Display}</p> : null;
}

export default function Preview() {
  const currentCallData = useCall((state) => state.currentCallData);
  const message = currentCallData
    ? STATUS_MESSAGES[currentCallData.status]
    : null;

  return (
    <div className="w-full h-full flex items-center justify-center">
      {currentCallData?.status === "ready" ? (
        <div className="flex flex-col gap-2">
          {currentCallData.userIds.map((userId) => (
            <Participant key={userId} userId={userId} />
          ))}
        </div>
      ) : message ? (
        <p className="text-2xl">{message}</p>
      ) : null}
    </div>
  );
}
