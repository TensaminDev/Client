import { useCall } from "../store";
import { useUserFields } from "@tensamin/identity/context";

const USER_FIELDS = ["Display"] as const;

function Participant({ userId }: { userId: number }) {
  const { data: user } = useUserFields(userId, USER_FIELDS);
  return user ? <p className="text-2xl">User: {user.Display}</p> : null;
}

export default function Preview() {
  const currentCallData = useCall((state) => state.currentCallData);

  return (
    <div className="w-full h-full flex items-center justify-center">
      {currentCallData?.exists ? (
        <div className="flex flex-col gap-2">
          {currentCallData.UserIds.map((userId) => (
            <Participant key={userId} userId={userId} />
          ))}
        </div>
      ) : (
        <p className="text-2xl">Call expired</p>
      )}
    </div>
  );
}
