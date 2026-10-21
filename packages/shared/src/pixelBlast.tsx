import { Component, type ComponentProps } from "react";
import { PixelBlast } from "@nonanium/ui";

function canCreateWebGLContext() {
  if (typeof document === "undefined") return false;

  try {
    // PixelBlast uses Three.js, which requires WebGL2. Release the probe so
    // it doesn't consume a context needed by the actual animation.
    const context = document.createElement("canvas").getContext("webgl2", {
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

// Keep optional decoration failures out of the app-wide error screen, even
// if the browser stops allowing new contexts after the capability check.
export default class OptionalPixelBlast extends Component<
  ComponentProps<typeof PixelBlast>
> {
  state = { available: canCreateWebGLContext() };

  static getDerivedStateFromError() {
    return { available: false };
  }

  render() {
    return this.state.available ? <PixelBlast {...this.props} /> : null;
  }
}
