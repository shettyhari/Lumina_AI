import { createContext, useContext, ReactNode } from "react";
import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth-context";

interface FeatureFlags {
  imageGen: boolean;
  voiceChat: boolean;
  personas: boolean;
  memories: boolean;
}

interface FamilyStatusContextType {
  status: string;
  role: string;
  isAdmin: boolean;
  featureFlags: FeatureFlags;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  isLoading: boolean;
  refetch: () => void;
}

const defaultFlags: FeatureFlags = { imageGen: true, voiceChat: true, personas: true, memories: true };

const FamilyStatusContext = createContext<FamilyStatusContextType>({
  status: "approved",
  role: "member",
  isAdmin: false,
  featureFlags: defaultFlags,
  storageQuotaBytes: 104857600,
  storageUsedBytes: 0,
  isLoading: true,
  refetch: () => {},
});

export function FamilyStatusProvider({ children }: { children: ReactNode }) {
  const { isSignedIn: clerkSignedIn, user: clerkUser } = useUser();
  const { user: authUser, token: authToken, isAuthenticated } = useAuth();

  const isSignedIn = isAuthenticated || Boolean(clerkSignedIn);
  const effectiveUserId = authUser?.id ?? clerkUser?.id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["userStatus", effectiveUserId],
    queryFn: async () => {
      const params = new URLSearchParams();
      const name = authUser?.displayName || clerkUser?.fullName;
      const email = authUser?.email || clerkUser?.primaryEmailAddress?.emailAddress;
      if (name) params.set("name", name);
      if (email) params.set("email", email);
      if (clerkUser?.imageUrl) params.set("avatar", clerkUser.imageUrl);
      const resp = await fetch(`/api/user/status?${params}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed to fetch status");
      return resp.json() as Promise<{
        status: string;
        role: string;
        isAdmin: boolean;
        storageQuotaBytes: number;
        storageUsedBytes: number;
        featureFlags: FeatureFlags;
      }>;
    },
    enabled: isSignedIn,
    staleTime: 30_000,
    retry: 2,
  });

  return (
    <FamilyStatusContext.Provider
      value={{
        status: data?.status ?? "pending",
        role: data?.role ?? "member",
        isAdmin: data?.isAdmin ?? false,
        featureFlags: data?.featureFlags ?? defaultFlags,
        storageQuotaBytes: data?.storageQuotaBytes ?? 104857600,
        storageUsedBytes: data?.storageUsedBytes ?? 0,
        isLoading: isLoading && !!isSignedIn,
        refetch,
      }}
    >
      {children}
    </FamilyStatusContext.Provider>
  );
}

export function useFamilyStatus() {
  return useContext(FamilyStatusContext);
}
