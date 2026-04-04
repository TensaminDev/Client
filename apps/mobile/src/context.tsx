import { createContext } from "react";

type contextType = {
  nothing: undefined;
};

export const context = createContext<contextType | undefined>(undefined);

export default function Provider({ children }: { children: React.ReactNode }) {
  return (
    <context.Provider
      value={{
        nothing: undefined,
      }}
    >
      {children}
    </context.Provider>
  );
}
