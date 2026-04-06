import * as React from "react";
import CreateScreen from "./util";

const DELAY = 250;

type ScreenProps = {
  progress: number;
  title?: string;
  description?: string;
  fullscreen?: boolean;
};

/**
 * Executes Screen.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Screen(props: ScreenProps) {
  const [displayProgress, setDisplayProgress] = React.useState(0);
  const displayProgressRef = React.useRef(0);

  React.useEffect(() => {
    displayProgressRef.current = displayProgress;
  }, [displayProgress]);

  React.useEffect(() => {
    const target = props.progress;
    const start = displayProgressRef.current;
    const delta = target - start;

    if (delta === 0) {
      return;
    }

    const duration = DELAY;
    const startTime = performance.now();
    let frameId = 0;

    /**
     * Executes animate.
     * @param now Parameter now.
     * @returns unknown.
     */
    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayProgress(start + delta * eased);

      if (t < 1) {
        frameId = requestAnimationFrame(animate);
      }
    }

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [props.progress]);

  return (
    <CreateScreen>
      <h2 className="text-base font-semibold text-foreground">
        {props.title ?? "Loading"}
      </h2>
      {props.description ? (
        <p className="text-sm text-muted-foreground mt-1 mb-5">
          {props.description}
        </p>
      ) : (
        <div className="mb-5" />
      )}
      <div className="w-64 h-1.5 bg-secondary rounded-full overflow-hidden relative">
        <div
          className="h-full bg-primary absolute left-0 top-0"
          style={{
            width: `${displayProgress}%`,
          }}
        />
      </div>
    </CreateScreen>
  );
}
