import { useUser, useClerk } from "@clerk/react";
import { Clock, ShieldCheck, LogOut, Mail } from "lucide-react";
import { useFamilyStatus } from "@/contexts/family-context";
import { useEffect } from "react";

export default function PendingPage({ rejected = false }: { rejected?: boolean }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { refetch } = useFamilyStatus();

  // Poll for approval every 30s so the user gets in automatically when approved
  useEffect(() => {
    if (rejected) return;
    const interval = setInterval(refetch, 30_000);
    return () => clearInterval(interval);
  }, [rejected, refetch]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[600px] rounded-full blur-3xl opacity-20 ${rejected ? "bg-red-500" : "bg-primary"}`} />
      </div>

      <div className="relative z-10 flex max-w-md flex-col items-center gap-8 text-center">
        {/* Icon */}
        <div className={`flex h-20 w-20 items-center justify-center rounded-2xl border ${rejected ? "border-destructive/30 bg-destructive/10" : "border-primary/30 bg-primary/10"}`}>
          {rejected ? (
            <ShieldCheck className="h-10 w-10 text-destructive" />
          ) : (
            <Clock className={`h-10 w-10 text-primary animate-pulse`} />
          )}
        </div>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-iridescent shadow-lg">
            <img src="/logo.svg" alt="Lumina" className="w-4 h-4 object-contain" />
          </div>
          <span className="text-lg font-semibold text-foreground">Lumina AI</span>
        </div>

        {/* Heading */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-foreground">
            {rejected ? "Access Declined" : "Waiting for Approval"}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {rejected
              ? "Your request to join the family space has been declined. Please contact the family admin if you think this is a mistake."
              : "Your account is waiting for the family admin to approve it. You'll be let in automatically once approved."}
          </p>
        </div>

        {/* User card */}
        {user && (
          <div className="w-full rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <img
              src={user.imageUrl}
              alt={user.fullName || "User"}
              className="h-10 w-10 rounded-full border border-border"
            />
            <div className="flex flex-col items-start overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">{user.fullName || "Your Account"}</span>
              <span className="truncate text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {user.primaryEmailAddress?.emailAddress}
              </span>
            </div>
            <div className={`ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${rejected ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-400"}`}>
              {rejected ? "Rejected" : "Pending"}
            </div>
          </div>
        )}

        {/* Status message */}
        {!rejected && (
          <p className="text-xs text-muted-foreground">
            Checking every 30 seconds · Page will update automatically when approved
          </p>
        )}

        {/* Sign out */}
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
