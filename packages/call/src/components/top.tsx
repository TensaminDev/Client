import { useCall } from "../store";

export default function TopBar() {
  const room = useCall((state) => state.room);

  const users = new Array(room.remoteParticipants.size).fill(0).map((_, i) => {
    const participant = Array.from(room.remoteParticipants.values())[i];
    return participant.identity;
  });

  return (
    <div className="w-full flex justify-between h-12">
      <div className="flex gap-1">
        {users.map((user) => (
          <div key={user}>{user}</div>
        ))}
      </div>
    </div>
  );
}
