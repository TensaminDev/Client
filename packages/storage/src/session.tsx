import { useTTP } from "@tensamin/ttp";
import {
  createContext,
  type ReactNode,
  useState,
  useContext,
  useEffect,
} from "react";
import { useStorage } from "./context";
import type { Contacts, Communities, Calls } from "@tensamin/shared/data";

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
  const { freshContacts, freshCommunities, freshCalls } = useTTP();
  const { load, save } = useStorage();
  const [contacts, setContacts] = useState<Contacts>([]);
  const [communities, setCommunities] = useState<Communities>([]);
  const [localCalls, setLocalCalls] = useState<Calls>([]);
  const calls = [
    ...freshCalls,
    ...localCalls.filter(
      (call) => !freshCalls.some((fresh) => fresh.call_id === call.call_id),
    ),
  ];

  // Cached session data fills in items the server did not return freshly.
  useEffect(() => {
    load("cached_contacts").then((cachedData) => {
      setContacts([
        ...freshContacts,
        ...cachedData.filter(
          (item) =>
            !freshContacts.some((fresh) => fresh.user_id === item.user_id),
        ),
      ]);
    });
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
  }, [load, freshContacts, freshCommunities]);

  useEffect(() => {
    save("cached_contacts", contacts);
  }, [contacts, save]);
  useEffect(() => {
    save("cached_communities", communities);
  }, [communities, save]);

  const moveUserIdToTop = (userId: number) => {
    setContacts((prevContacts) => {
      const userIndex = prevContacts.findIndex(
        (contact) => contact.user_id === userId,
      );
      if (userIndex === -1) return prevContacts;
      const [user] = prevContacts.splice(userIndex, 1);
      return [user, ...prevContacts];
    });
  };

  const insertContact = (userId: number) => {
    setContacts((prevContacts) => {
      if (prevContacts.some((contact) => contact.user_id === userId)) {
        return prevContacts;
      }

      const newUser = {
        user_id: userId,
        last_message_at: new Date().getTime(),
        messages: [],
      } satisfies Contacts[0];

      return [newUser, ...prevContacts];
    });
  };

  const insertCall = (call: Calls[number]) => {
    setLocalCalls((prevCalls) => {
      if (prevCalls.some((prevCall) => prevCall.call_id === call.call_id)) {
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
