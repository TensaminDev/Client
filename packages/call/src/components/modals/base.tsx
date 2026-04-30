import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tensamin/ui";
import {
  focusParticipant,
  getParsedParticipantMetadata,
  setCallView,
  useCall,
} from "../../store";
import { Track, type Participant } from "livekit-client";
import { useEffect, useState } from "react";
import { useUser, type User } from "@tensamin/user/context";
import VideoViewer from "../videoViewer";
import { Loader2, MicOff, Monitor, Shield } from "lucide-react";

function TransparentButton({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-6 px-1.5 bg-black/40 backdrop-blur-xs border rounded-sm flex items-center justify-center">
      {children}
    </div>
  );
}

function Overlay({
  type,
  user,
  participant,
}: {
  type: "user" | "stream";
  user: User;
  participant: Participant;
}) {
  const { isAdmin } = getParsedParticipantMetadata(user.user_id) || {
    isAdmin: false,
  };

  return (
    <div className="w-full h-auto flex items-center gap-1">
      {type === "user" && (
        <>
          {!participant.isMicrophoneEnabled && (
            <TransparentButton>
              <MicOff className="size-3.5" />
            </TransparentButton>
          )}
          {isAdmin && (
            <TransparentButton>
              <Shield className="size-3.5" />
            </TransparentButton>
          )}
        </>
      )}
      {type === "stream" && (
        <TransparentButton>
          <Monitor className="size-3.5" />
        </TransparentButton>
      )}
      <TransparentButton>
        <p className="text-sm">{user.display}</p>
      </TransparentButton>
    </div>
  );
}

export default function Base({
  participant,
  type,
  flush = false,
}: {
  participant: Participant | undefined;
  type: "user" | "stream";
  flush?: boolean;
}) {
  const { get } = useUser();

  const focusedParticipantId = useCall((state) => state.focusedParticipantId);
  const view = useCall((state) => state.view);
  const [user, setUser] = useState<User | null>(null);
  const screenSharePublication = participant?.getTrackPublication(
    Track.Source.ScreenShare,
  );

  useEffect(() => {
    const participantId = Number(participant?.identity);

    if (
      !participant ||
      !Number.isInteger(participantId) ||
      participantId <= 0
    ) {
      // eslint-disable-next-line
      setUser(null);
      return;
    }

    let active = true;

    void get(participantId).then((nextUser) => {
      if (active) {
        setUser(nextUser);
      }
    });

    return () => {
      active = false;
    };
  }, [participant, get]);

  if (!participant || !user) {
    return (
      <div
        className={`aspect-video w-full animate-pulse bg-muted ${
          flush ? "rounded-none" : "rounded-md"
        }`}
      />
    );
  }

  const onClick = () => {
    if (view === "grid") {
      focusParticipant(user.user_id);
    } else {
      if (user.user_id === focusedParticipantId) {
        setCallView("grid");
      } else {
        focusParticipant(user.user_id);
      }
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            onClick={onClick}
            className={`relative aspect-video w-full border-2 ${
              flush ? "rounded-none border-x-0" : "rounded-md"
            }`}
          >
            <div className="z-20 absolute bottom-0 left-0 w-full h-full flex justify-start items-end p-2">
              {view === "grid" ||
              (view === "focused" && user.user_id !== focusedParticipantId) ? (
                <Overlay type={type} user={user} participant={participant} />
              ) : null}
            </div>
            <div
              className={`z-10 bg-card absolute top-0 left-0 w-full h-full flex items-center justify-center ${
                flush ? "rounded-none" : "rounded-sm"
              }`}
            >
              {/* Detect video / user and place here */}

              {type === "stream" &&
                (screenSharePublication?.isSubscribed &&
                screenSharePublication.track ? (
                  <VideoViewer
                    flush={flush}
                    participantId={participant.identity}
                    publication={screenSharePublication}
                  />
                ) : (
                  <Loader2 className="animate-spin" />
                ))}

              {type === "user" && <p>{user.display}</p>}
            </div>
          </div>
        }
      />
      <ContextMenuContent>
        <ContextMenuItem>Stop Watching</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
