import { createContext, useContext, ReactNode } from "react";
import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";

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
  status: "pending",
  role: "member",
  isAdmin: false,
  featureFlags: defaultFlags,
  storageQuotaBytes: 104857600,
  storageUsedBytes: 0,
  isLoading: true,
  refetch: () => {},
});

export function FamilyStatusProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, user } = useUser();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["userStatus", user?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (user?.fullName) params.set("name", user.fullName);
      if (user?.primaryEmailAddress?.emailAddress) params.set("email", user.primaryEmailAddress.emailAddress);
      if (user?.imageUrl) params.set("avatar", user.imageUrl);
      const resp = await fetch(`/api/user/status?${params}`);
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
    enabled: !!isSignedIn && !!user,
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
