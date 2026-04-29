import { useCrypto } from "@tensamin/crypto/context";
import { useStorage } from "@tensamin/storage/context";
import { useUser } from "@tensamin/user/context";
import { useTTP } from "@tensamin/ttp";
import { createContext, useEffect, useContext } from "react";
import z from "zod";
import { toast as sonnerToast } from "sonner";
import { message as messageSchema } from "@tensamin/shared/data";

export const context = createContext<contextType | undefined>(undefined);

export default function Provider(props: { children: React.ReactNode }) {
  const { subscribePush } = useTTP();
  const { load } = useStorage();
  const { get } = useUser();
  const { decryptText, getSharedSecret } = useCrypto();

  useEffect(() => {
    subscribePush(async (ttpMessage) => {
      if (ttpMessage.type === "message_live") {
        const { message, sender_id } = ttpMessage.data as {
          message: z.infer<typeof messageSchema>;
          sender_id: number;
        };

        const decryptedContent = await decryptText(
          await getSharedSecret(
            await load("private_key"),
            await get(await load("user_id")).then((data) => data.public_key),
            await get(sender_id).then((data) => data.public_key),
          ),
          message.content,
        );

        sonnerToast(decryptedContent, {
          icon: <div>A</div>,
        });
      }
    });
  }, [subscribePush, decryptText, getSharedSecret, load, get]);

  return (
    <context.Provider value={{ test: () => {} }}>
      {props.children}
    </context.Provider>
  );
}

type contextType = {
  test: () => void;
};

/**
 * Executes useNotifications.
 * @param none This function has no parameters.
 * @returns contextType.
 */
export function useNotifications(): contextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useNotifications must be used within a ChatProvider");
  }
  return ctx;
}
