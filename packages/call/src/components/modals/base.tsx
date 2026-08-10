import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  ContextMenu as UIContextMenu,
  ContextMenuTrigger,
  cn,
} from "@methanium/ui";
import {
  focusParticipant,
  getRoomMetadata,
  setCallView,
  startWatchingStream,
  useCall,
} from "../../store";
import { Track, type Participant } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { type SelectedUser, useUserFields } from "@tensamin/user/context";
import { useIsSpeaking } from "../../speakingState";
import VideoViewer from "../videoViewer";
import { HeadphoneOff, MicOff, Monitor, Plus, Shield } from "lucide-react";
import ContextMenu from "./contextMenu";
import { useStorage } from "@tensamin/storage/context";

const USER_FIELDS = ["UserId", "Avatar", "Display"] as const;

function getTrackPublicationBySource(
  participant: Participant | undefined,
  source: Track.Source,
) {
  if (!participant) {
    return undefined;
  }

  return [...participant.trackPublications.values()].find(
    (publication) => publication.source === source,
  );
}

function TransparentButton({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-6 px-1.5 bg-black/40 backdrop-blur-xs border rounded-sm flex items-center justify-center">
      {children}
    </div>
  );
}

export function getAverageImageColor(src: string) {
  return new Promise<string | undefined>((resolve) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        resolve(undefined);
        return;
      }

      canvas.width = 32;
      canvas.height = 32;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      try {
        const { data } = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
        let red = 0;
        let green = 0;
        let blue = 0;
        let total = 0;

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3];

          if (alpha < 128) {
            continue;
          }

          red += data[index] * alpha;
          green += data[index + 1] * alpha;
          blue += data[index + 2] * alpha;
          total += alpha;
        }

        if (total === 0) {
          resolve(undefined);
          return;
        }

        const darken = 0.7;

        resolve(
          `rgb(${Math.round((red / total) * darken)}, ${Math.round((green / total) * darken)}, ${Math.round((blue / total) * darken)})`,
        );
      } catch {
        resolve(undefined);
      }
    };
    image.onerror = () => resolve(undefined);
    image.src = src;
  });
}

function Overlay({
  type,
  user,
  participant,
}: {
  type: "user" | "stream";
  user: SelectedUser<typeof USER_FIELDS>;
  participant: Participant;
}) {
  const isAdmin = getRoomMetadata()?.admins.includes(user.UserId) === true;
  const isDeafened = participant.attributes["deafened"] === "true";

  return (
    <div className="w-full h-auto flex items-center gap-1">
      {type === "user" && (
        <>
          {!participant.isMicrophoneEnabled && (
            <TransparentButton>
              <MicOff className="size-3.5" />
            </TransparentButton>
          )}
          {isDeafened && (
            <TransparentButton>
              <HeadphoneOff className="size-3.5" />
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
        <p className="text-sm">{user.Display}</p>
      </TransparentButton>
    </div>
  );
}

export default function Base({
  participant,
  type,
  fill = false,
  flush = false,
}: {
  participant: Participant | undefined;
  type: "user" | "stream";
  fill?: boolean;
  flush?: boolean;
}) {
  const { load } = useStorage();

  const focusedParticipantId = useCall((state) => state.focusedParticipantId);
  const view = useCall((state) => state.view);
  const participantId = Number(participant?.identity);
  const validParticipantId =
    participant && Number.isInteger(participantId) && participantId > 0
      ? participantId
      : null;
  const { data: user } = useUserFields(validParticipantId, USER_FIELDS);
  const [avatarBackgroundColor, setAvatarBackgroundColor] = useState<
    string | undefined
  >(undefined);
  const isSpeaking = useIsSpeaking(user?.UserId ?? -1);
  const screenSharePublication = getTrackPublicationBySource(
    participant,
    Track.Source.ScreenShare,
  );
  const screenSharePreview = participant?.attributes["screenSharePreview"];
  const cameraPublication = getTrackPublicationBySource(
    participant,
    Track.Source.Camera,
  );
  const cameraDisabled = useCall((state) =>
    user ? state.disabledCameraParticipantIds.includes(user.UserId) : false,
  );

  const [ownId, setOwnId] = useState(0);
  useEffect(() => {
    load("user_id").then(setOwnId);
  }, [load]);

  useEffect(() => {
    if (type !== "user" || !user?.Avatar) {
      setAvatarBackgroundColor(undefined);
      return;
    }

    let active = true;

    void getAverageImageColor(user.Avatar).then((color) => {
      if (active) {
        setAvatarBackgroundColor(color);
      }
    });

    return () => {
      active = false;
    };
  }, [type, user?.Avatar]);

  // Avatar calc
  const currentCard = useRef<HTMLDivElement>(null);

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
      focusParticipant(user.UserId, type);
    } else {
      if (user.UserId === focusedParticipantId) {
        setCallView("grid");
      } else {
        focusParticipant(user.UserId, type);
      }
    }
  };

  const showStream =
    screenSharePublication?.isSubscribed && screenSharePublication.track;

  const isFocusedInFocusedView =
    view === "focused" && user.UserId === focusedParticipantId;

  return (
    <UIContextMenu>
      <ContextMenuTrigger
        render={
          <div
            onClick={onClick}
            className={cn(
              "relative w-full",
              fill ? "h-full" : "aspect-video",
              flush && !fill && "border-x-0!",
              type === "user" &&
                isSpeaking &&
                "border-4 border-(--primary-foreground-alt)/75! rounded-lg",
            )}
          >
            <div className="z-20 absolute bottom-0 left-0 w-full h-full flex justify-start items-end p-2">
              <>
                {type === "stream" && !showStream && (
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={(event) => {
                        if (isFocusedInFocusedView) event.stopPropagation();
                        startWatchingStream(user.UserId);
                      }}
                    >
                      Watch Stream
                    </Button>
                    {!isFocusedInFocusedView && (
                      <Button
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          startWatchingStream(user.UserId);
                        }}
                      >
                        <Plus className="w-8 h-8" />
                      </Button>
                    )}
                  </div>
                )}
                {view === "grid" ||
                (view === "focused" && user.UserId !== focusedParticipantId) ? (
                  <Overlay type={type} user={user} participant={participant} />
                ) : null}
              </>
            </div>
            <div
              ref={currentCard}
              className={`transition-all duration-150 z-10 bg-card absolute top-0 left-0 w-full h-full flex gap-2 items-center justify-center ${
                flush ? "rounded-none" : "rounded-lg"
              }`}
              style={{
                backgroundColor: avatarBackgroundColor,
                containerType: "size",
              }}
            >
              {/* Detect video / user and place here */}

              {type === "stream" &&
                (showStream ? (
                  <VideoViewer
                    fill={fill}
                    flush={flush}
                    participantId={participant.identity}
                    publication={screenSharePublication}
                  />
                ) : screenSharePreview ? (
                  <div
                    className={`absolute inset-0 bg-muted h-full w-full object-cover ${
                      flush ? "rounded-none" : "rounded-sm"
                    }`}
                  >
                    <img
                      src={screenSharePreview}
                      className={`blur-sm h-full w-full object-cover opacity-50 ${
                        flush ? "rounded-none" : "rounded-sm"
                      }`}
                    />
                  </div>
                ) : null)}

              {type === "user" &&
                (cameraPublication?.track && !cameraDisabled ? (
                  <VideoViewer
                    fill={fill}
                    flush={flush}
                    participantId={participant.identity}
                    publication={cameraPublication}
                  />
                ) : (
                  <Avatar
                    style={{
                      width: "32cqh",
                      height: "32cqh",
                    }}
                  >
                    <AvatarImage src={user.Avatar} />
                    <AvatarFallback
                      style={{
                        fontSize: "11cqh",
                      }}
                    >
                      {user.Display.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
            </div>
          </div>
        }
      />
      <ContextMenu user={user} ownId={ownId} />
    </UIContextMenu>
  );
}
