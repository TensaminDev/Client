import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "@tensamin/shared/log";
import { cn } from "@methanium/ui";

export function QrDisplay({
  className,
  locator,
}: {
  className?: string;
  locator: string;
}) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    setImage("");
    void QRCode.toDataURL(locator, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: "M",
    }).then(
      (value) => {
        if (active) setImage(value);
      },
      () => {
        if (active) toast("error", "Could not generate login QR code");
      },
    );
    return () => {
      active = false;
    };
  }, [locator]);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {image ? (
        <img
          className="aspect-square w-full max-w-80"
          src={image}
          alt="Device login QR code"
        />
      ) : (
        <div
          className="aspect-square w-full animate-pulse rounded-lg bg-muted"
          role="status"
          aria-label="Generating login QR code"
        />
      )}
    </div>
  );
}
