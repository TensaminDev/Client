import { Lock, LockOpen } from "lucide-react";
import { useCall } from "../context";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
} from "@tensamin/ui";
import { LeaveIcon } from "@livekit/components-react";
import ScreenshareButton from "./buttons/screenshare";
import MuteButton from "./buttons/mute";
import DeafButton from "./buttons/deaf";
import { Room, Track } from "livekit-client";
import { useEffect, useState } from "react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

export default function SidebarBox() {
  const { state, disconnect } = useCall();
  const isMobile = useIsMobile();

  return state === "closed" ? null : (
    <Card className="p-1.5 gap-2" hidden={isMobile}>
      <CardHeader className="p-0! pb-2! border-b-2">
        <ConnectionBar />
      </CardHeader>
      <CardContent className="p-0! flex flex-col gap-1">
        <div className="flex justify-start gap-1">
          <MuteButton className="w-9 h-9" />
          <DeafButton className="w-9 h-9" />
          <ScreenshareButton className="w-9 h-9" />
          <Button
            size="lg"
            className="w-9 h-9"
            onClick={() => disconnect()}
            variant="destructive"
          >
            <LeaveIcon />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectionBar() {
  const { state, room, openCallPage, callId } = useCall();
  const encrypted =
    room.localParticipant.isE2EEEnabled && room.localParticipant.isEncrypted;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            onClick={() => openCallPage(callId || "")}
            size="lg"
            variant={
              state === "open" && encrypted ? "subtleDefault" : "destructive"
            }
            className="flex justify-between items-center"
          >
            {state === "encrypting" && "Encrypting..."}
            {state === "connecting" && "Connecting..."}
            {state === "open" && "Connected"}
            {state === "closed" && "Closed"}
            {state === "closing" && "Closing"}

            <TinyPingGraph />

            {encrypted ? (
              <Lock color="var(--primary-foreground-alt)" />
            ) : (
              <LockOpen color="var(--destructive)" />
            )}
          </Button>
        }
      />
      <TooltipContent>Click to open call page</TooltipContent>
    </Tooltip>
  );
}

export function TinyPingGraph() {
  const { room } = useCall();

  const [mapData, setMapData] = useState<Map<number, number>>(
    () => new Map([[Date.now(), 0]]),
  );

  const data = Array.from(mapData, ([time, ping]) => ({ time, ping }));

  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      const ping = await getPing(room);
      const cutoff = now - 10_000;

      setMapData((prev) => {
        const next = new Map(prev);

        next.set(now, ping || 0);

        for (const time of next.keys()) {
          if (time < cutoff) next.delete(time);
        }

        return next;
      });
    }, 2_000);

    return () => clearInterval(interval);
  }, [room]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="w-full h-6"
            style={{
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, var(--primary) 15%, var(--primary) 85%, transparent 100%)",
              maskImage:
                "linear-gradient(to right, transparent 0%, var(--primary) 15%, var(--primary) 85%, transparent 100%)",
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
              >
                <defs>
                  <linearGradient id="pingGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="currentColor"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="70%"
                      stopColor="currentColor"
                      stopOpacity={0.08}
                    />
                    <stop
                      offset="100%"
                      stopColor="currentColor"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>

                <Area
                  type="monotone"
                  dataKey="ping"
                  stroke="currentColor"
                  strokeWidth={2}
                  fill="url(#pingGradient)"
                  fillOpacity={1}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        }
      />
      <TooltipContent>{data.at(-1)?.ping} ms</TooltipContent>
    </Tooltip>
  );
}

async function getPing(room: Room): Promise<number | undefined> {
  const report = await room.localParticipant
    .getTrackPublication(Track.Source.Microphone)
    ?.track?.getRTCStatsReport();

  if (!report) return;

  let bestRtt: number | undefined;

  report.forEach((stat) => {
    if (
      stat.type === "candidate-pair" &&
      stat.state === "succeeded" &&
      stat.currentRoundTripTime != null
    ) {
      bestRtt = stat.currentRoundTripTime * 1000;
    }

    if (stat.type === "remote-inbound-rtp" && stat.roundTripTime != null) {
      bestRtt = stat.roundTripTime * 1000;
    }
  });

  return Math.round(bestRtt || 0);
}
