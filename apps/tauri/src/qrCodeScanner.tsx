import {
  scan,
  Format,
  requestPermissions,
} from "@tauri-apps/plugin-barcode-scanner";
import { Button } from "@tensamin/ui/cmp/button";

import { toast } from "@tensamin/shared/log";

export default function QrCodeScanner({
  onData,
}: {
  onData: (data: string) => void;
}) {
  return (
    <Button
      onClick={() => {
        requestPermissions()
          .catch((err) => {
            toast("error", err.message);
          })
          .then(() =>
            scan({ windowed: false, formats: [Format.QRCode] })
              .catch((err) => {
                toast("error", err.message);
              })
              .then((data) => {
                if (data) {
                  onData(data.content);
                }
              }),
          );
      }}
    >
      Open QR Code Scanner
    </Button>
  );
}
