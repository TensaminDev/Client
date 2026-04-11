import { useStorage } from "@tensamin/storage/context";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button
} from "@tensamin/ui";

export default function Page() {
  return (
    <div>
      <QrCodeLogin />
    </div>
  );
}

// QR Code Login
const generateQR = async (text: string): Promise<string> => {
  try {
    const url = await QRCode.toDataURL(text, {
      errorCorrectionLevel: "H",
      margin: 1,
      color: {
        dark: "#000000FF",
        light: "#FFFFFFFF",
      },
    });
    return url;
  } catch (err) {
    console.error(err);
    throw err;
  }
};
function QrCodeLogin() {
  const { load } = useStorage();
  const [userId, setUserId] = useState<number>(0);
  const [privateKey, setPrivateKey] = useState<string>("");
  const [qrCodeBase64, setQrCodeBase64] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    load("private_key").then((value) => {
      if (value) {
        setPrivateKey(value);
      }
    });
    load("user_id").then((value) => {
      if (value) {
        setUserId(value);
      }
    });
  }, [load]);

  useEffect(() => {
    if (userId && privateKey) {
      generateQR(`tensamin://tu::${userId}::${privateKey}`).then(
        setQrCodeBase64,
      );
    }
  }, [userId, privateKey]);

  const [qrCodeVisible, setQrCodeVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1 pl-2">
      <p>Login QR Code</p>
      <div className="relative rounded-lg w-50 border-3 aspect-square overflow-hidden">
        {qrCodeBase64 && (
          <img className="w-full h-full" src={qrCodeBase64} alt="QR Code" />
        )}
        {!qrCodeVisible && (
          <>
            <div className="absolute top-0 left-0 w-full h-full backdrop-blur-sm bg-background/50" />
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
              <AlertDialog>
                <AlertDialogTrigger render={<Button>Show QR Code</Button>} />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Exposing this QR code is the same as sharing your .tu
                      file. Since changing your private key is quite tedious,
                      only do this when you're confident the key won't be
                      compromised.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      render={
                        <Button onClick={() => setQrCodeVisible(true)}>
                          Show QR Code
                        </Button>
                      }
                    />
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
