import { Lock, LockOpen } from "lucide-react";
import { openCallPage, useCall } from "../store";
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
import ScreenshareButton from "./buttons/screenshare";
import MuteButton from "./buttons/mute";
import DeafButton from "./buttons/deaf";
import { Room, Track } from "livekit-client";
import { useEffect, useState } from "react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import LeaveButton from "./buttons/leave";

export default function SidebarBox() {
  const state = useCall((store) => store.state);
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
          <LeaveButton className="w-9 h-9" />
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectionBar() {
  const state = useCall((store) => store.state);
  const isEncrypted = useCall((store) => store.isEncrypted);
  const callId = useCall((store) => store.callId);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            onClick={() => openCallPage(callId || "")}
            size="lg"
            variant={
              state === "open" && isEncrypted ? "subtleDefault" : "destructive"
            }
            className="flex justify-between items-center"
          >
            {state === "encrypting" && "Encrypting..."}
            {state === "connecting" && "Connecting..."}
            {state === "open" && "Connected"}
            {state === "closed" && "Closed"}
            {state === "closing" && "Closing"}

            <TinyPingGraph />

            {isEncrypted ? (
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
  const room = useCall((store) => store.room);

  const [mapData, setMapData] = useState<Map<number, number>>(() => new Map());

  const data = Array.from(mapData, ([time, ping]) => ({ time, ping }));

  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      const ping = await getPing(room);
      const cutoff = now - 10_000;

      setMapData((prev) => {
        const next = new Map(prev);

        if (ping != null && ping > 0) {
          next.set(now, ping);
        }

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
            className="h-6 w-24 min-w-0 shrink-0"
            style={{
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, var(--primary) 15%, var(--primary) 85%, transparent 100%)",
              maskImage:
                "linear-gradient(to right, transparent 0%, var(--primary) 15%, var(--primary) 85%, transparent 100%)",
            }}
          >
            {data.length > 1 && (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={24}
              >
                <AreaChart
                  data={data}
                  margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="pingGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
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
            )}
          </div>
        }
      />
      <TooltipContent>
        {data.length > 0 ? `${data.at(-1)?.ping} ms` : "Measuring ping..."}
      </TooltipContent>
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

  if (bestRtt == null || bestRtt <= 0) return;

  const roundedRtt = Math.round(bestRtt);

  if (roundedRtt <= 0) return;

  return roundedRtt;
}
