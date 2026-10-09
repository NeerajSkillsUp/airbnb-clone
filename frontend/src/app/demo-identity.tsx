"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type DemoIdentity = {
  id: number;
  display_name: string;
  role: "guest" | "host";
};

type DemoIdentityContextValue = {
  users: DemoIdentity[];
  identity: DemoIdentity | null;
  isReady: boolean;
  error: string | null;
  selectIdentity: (id: number) => void;
};

const DemoIdentityContext = createContext<DemoIdentityContextValue | null>(null);
const STORAGE_KEY = "airbnb-demo-identity-id";

function isDemoIdentity(value: unknown): value is DemoIdentity {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "number" &&
    typeof user.display_name === "string" &&
    (user.role === "guest" || user.role === "host")
  );
}

export function DemoIdentityProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<DemoIdentity[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadUsers() {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
      if (!apiUrl) {
        setError("The demo identity service is not configured.");
        setIsReady(true);
        return;
      }
      try {
        const response = await fetch(`${apiUrl}/users`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`The demo identity service returned an error (${response.status}).`);
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isDemoIdentity)) {
          throw new Error("The demo identity service returned an unexpected response.");
        }

        const storedId = window.localStorage.getItem(STORAGE_KEY);
        const storedUser = storedId === null
          ? undefined
          : data.find((user) => user.id === Number(storedId));
        const initialUser = storedUser ?? data.find((user) => user.role === "guest") ?? data[0];
        setUsers(data);
        if (initialUser) {
          setSelectedId(initialUser.id);
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load demo identities.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsReady(true);
        }
      }
    }

    void loadUsers();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (isReady && selectedId !== null) {
      window.localStorage.setItem(STORAGE_KEY, String(selectedId));
    }
  }, [isReady, selectedId]);

  const identity = users.find((user) => user.id === selectedId) ?? null;
  function selectIdentity(id: number) {
    if (users.some((user) => user.id === id)) {
      setSelectedId(id);
      setError(null);
    }
  }

  return (
    <DemoIdentityContext.Provider
      value={{ users, identity, isReady, error, selectIdentity }}
    >
      <div className="border-b border-[#ebebeb] bg-[#f7f7f7]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-end gap-3 px-6 py-2 text-xs lg:px-10">
          <label htmlFor="demo-identity" className="font-medium text-[#717171]">
            Demo identity
          </label>
          <select
            id="demo-identity"
            value={identity?.id ?? ""}
            disabled={!isReady || users.length === 0}
            onChange={(event) => selectIdentity(Number(event.target.value))}
            className="max-w-[220px] rounded-full border border-[#dddddd] bg-white px-3 py-1.5 text-xs text-[#222222] disabled:opacity-60"
          >
            {!identity && <option value="">Loading identities…</option>}
            {users.filter((user) => user.role === "guest").length > 0 && (
              <optgroup label="Guests">
                {users.filter((user) => user.role === "guest").map((user) => (
                  <option key={user.id} value={user.id}>{user.display_name}</option>
                ))}
              </optgroup>
            )}
            {users.filter((user) => user.role === "host").length > 0 && (
              <optgroup label="Hosts">
                {users.filter((user) => user.role === "host").map((user) => (
                  <option key={user.id} value={user.id}>{user.display_name}</option>
                ))}
              </optgroup>
            )}
          </select>
          {error && <span role="alert" className="text-[#c13515]">{error}</span>}
        </div>
      </div>
      {children}
    </DemoIdentityContext.Provider>
  );
}

export function useDemoIdentity(): DemoIdentityContextValue {
  const context = useContext(DemoIdentityContext);
  if (!context) {
    throw new Error("useDemoIdentity must be used within DemoIdentityProvider.");
  }
  return context;
}
