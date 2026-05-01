import { useTTP } from "@tensamin/ttp";
import {
  createContext,
  type ReactNode,
  useState,
  useContext,
  useEffect,
} from "react";
import { useStorage } from "./context";
import type { Contacts, Communities } from "@tensamin/shared/data";

interface SessionContextType {
  contacts: Contacts;
  communities: Communities;
  moveUserIdToTop: (userId: number) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export default function SessionProvider({ children }: { children: ReactNode }) {
  const { freshContacts, freshCommunities } = useTTP();
  const { load, save } = useStorage();
  const [contacts, setContacts] = useState<Contacts>([]);
  const [communities, setCommunities] = useState<Communities>([]);

  // Get cached data and merge fresh data
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

  // Save data
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

  return (
    <SessionContext.Provider value={{ contacts, communities, moveUserIdToTop }}>
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
