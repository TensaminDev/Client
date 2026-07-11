import { useMTP } from "@tensamin/mtp";
import {
  createContext,
  type ReactNode,
  useState,
  useContext,
  useEffect,
} from "react";
import { useStorage } from "./context";
import type { Contacts, Communities, Calls } from "@tensamin/shared/data";
import { createCache } from "@tensamin/cache";
import { secureValueCodec } from "./secure";

interface SessionContextType {
  contacts: Contacts;
  communities: Communities;
  calls: Calls;
  moveUserIdToTop: (userId: number) => void;
  insertContact: (userId: number) => void;
  insertCall: (call: Calls[number]) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export default function SessionProvider({ children }: { children: ReactNode }) {
  const { freshContacts, freshCommunities, freshCalls, contextReady } =
    useMTP();
  const { load, save } = useStorage();
  const [contacts, setContacts] = useState<Contacts>([]);
  const [communities, setCommunities] = useState<Communities>([]);
  const [localCalls, setLocalCalls] = useState<Calls>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const calls = [
    ...freshCalls,
    ...localCalls.filter(
      (call) => !freshCalls.some((fresh) => fresh.CallId === call.CallId),
    ),
  ];

  useEffect(() => {
    void load("user_id").then(setAccountId);
  }, [load]);

  // Cached contacts seed the session, then authenticated server data replaces them.
  useEffect(() => {
    if (!accountId) return;
    const cache = createCache(String(accountId), {
      codec: secureValueCodec,
    });
    void cache.contacts.get().then((cached) => {
      if (cached) setContacts(cached);
    });
  }, [accountId]);

  useEffect(() => {
    if (!accountId || !contextReady) return;
    setContacts(freshContacts);
  }, [accountId, contextReady, freshContacts]);

  useEffect(() => {
    load("cached_communities").then((cachedData) => {
      if (cachedData && freshCommunities) {
        setCommunities([
          ...freshCommunities,
          ...cachedData.filter(
            (item) =>
              !freshCommunities.some(
                (fresh) => fresh.community_id === item.community_id,
              ),
          ),
        ]);
      }
    });
  }, [load, freshCommunities]);
  useEffect(() => {
    save("cached_communities", communities);
  }, [communities, save]);

  const moveUserIdToTop = (userId: number) => {
    setContacts((prevContacts) => {
      const userIndex = prevContacts.findIndex(
        (contact) => contact.UserId === userId,
      );
      if (userIndex === -1) return prevContacts;
      const user = prevContacts[userIndex];
      return [
        user,
        ...prevContacts.slice(0, userIndex),
        ...prevContacts.slice(userIndex + 1),
      ];
    });
  };

  const insertContact = (userId: number) => {
    setContacts((prevContacts) => {
      if (prevContacts.some((contact) => contact.UserId === userId)) {
        return prevContacts;
      }

      const newUser = {
        UserId: userId,
        LastMessageAt: new Date().getTime(),
        Messages: [],
      } satisfies Contacts[0];

      return [newUser, ...prevContacts];
    });
  };

  const insertCall = (call: Calls[number]) => {
    setLocalCalls((prevCalls) => {
      if (prevCalls.some((prevCall) => prevCall.CallId === call.CallId)) {
        return prevCalls;
      }

      return [call, ...prevCalls];
    });
  };

  return (
    <SessionContext.Provider
      value={{
        contacts,
        communities,
        calls,
        moveUserIdToTop,
        insertContact,
        insertCall,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextType {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
