import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

declare global {
  interface Window {
    showDummyBar?: () => void;
  }
}

export type ContactJob = {
  contactId: number;
  operationId: string;
  label: string;
  state: "pending" | "running" | "failed";
  progress: number;
  priority: number;
  error?: string;
  cancel?: () => void;
  retry?: () => void;
};

const ContactJobsContext = createContext<{
  jobs: ContactJob[];
  dismissJob(contactId: number, operationId: string): void;
} | null>(null);
const ContactJobActionsContext = createContext<{
  setJob(job: ContactJob): void;
  updateJob(
    contactId: number,
    operationId: string,
    update: Partial<ContactJob> | { state: "success" },
  ): void;
} | null>(null);

export function ContactJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ContactJob[]>([]);
  const setJob = useCallback((job: ContactJob) => {
    setJobs((current) => [
      ...current.filter(
        (item) =>
          item.contactId !== job.contactId ||
          item.operationId !== job.operationId,
      ),
      job,
    ]);
  }, []);
  const dismissJob = useCallback((contactId: number, operationId: string) => {
    setJobs((current) =>
      current.filter(
        (item) =>
          item.contactId !== contactId || item.operationId !== operationId,
      ),
    );
  }, []);
  const updateJob = useCallback(
    (
      contactId: number,
      operationId: string,
      update: Partial<ContactJob> | { state: "success" },
    ) => {
      if (update.state === "success") {
        dismissJob(contactId, operationId);
        return;
      }
      setJobs((current) =>
        current.map((job) =>
          job.contactId === contactId && job.operationId === operationId
            ? { ...job, ...update }
            : job,
        ),
      );
    },
    [dismissJob],
  );
  useEffect(() => {
    window.showDummyBar = () => {
      const contactId = Number(new URLSearchParams(location.search).get("id"));
      const resolvedContactId = Number.isSafeInteger(contactId) ? contactId : 0;
      setJob({
        contactId: resolvedContactId,
        operationId: "dummy-background-job",
        label: "Dummy background job",
        state: "running",
        progress: 0.3,
        priority: Number.MAX_SAFE_INTEGER,
        cancel: () => dismissJob(resolvedContactId, "dummy-background-job"),
      });
    };
    return () => {
      delete window.showDummyBar;
    };
  }, [dismissJob, setJob]);
  const value = useMemo(() => ({ jobs, dismissJob }), [dismissJob, jobs]);
  const actions = useMemo(() => ({ setJob, updateJob }), [setJob, updateJob]);
  return (
    <ContactJobActionsContext.Provider value={actions}>
      <ContactJobsContext.Provider value={value}>
        {children}
      </ContactJobsContext.Provider>
    </ContactJobActionsContext.Provider>
  );
}

export function useContactJobs() {
  const value = useContext(ContactJobsContext);
  if (!value) throw new Error("useContactJobs requires ContactJobsProvider");
  return value;
}

export function useContactJobActions() {
  const value = useContext(ContactJobActionsContext);
  if (!value)
    throw new Error("useContactJobActions requires ContactJobsProvider");
  return value;
}
