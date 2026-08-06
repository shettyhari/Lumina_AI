import { useState } from "react";
import { useLocation } from "wouter";
import { Lock, Mail, User, ArrowRight, Sparkles } from "lucide-react";

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
}

export function AuthForm({ mode: initialMode }: AuthFormProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const userPayload = {
        email: email.trim(),
        displayName: mode === "sign-up" ? (name.trim() || email.split("@")[0]) : email.split("@")[0],
        clerkUserId: `user_${email.replace(/[^a-zA-Z0-9]/g, "_")}`,
      };

      localStorage.setItem("lumina_user_session", JSON.stringify(userPayload));

      setTimeout(() => {
        setIsLoading(false);
        setLocation("/chat");
      }, 300);
    } catch {
      setIsLoading(false);
      setError("Failed to log in. Please try again.");
    }
  };

  const handleDemoLogin = () => {
    setIsLoading(true);
    const demoPayload = {
      email: "admin@lumina.ai",
      displayName: "Dev Admin",
      clerkUserId: "dev_admin_user",
    };
    localStorage.setItem("lumina_user_session", JSON.stringify(demoPayload));

    setTimeout(() => {
      setIsLoading(false);
      setLocation("/chat");
    }, 300);
  };

  return (
    <div className="w-full max-w-md bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden text-left">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col items-center text-center mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {mode === "sign-in" ? "Welcome Back" : "Create Your Account"}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {mode === "sign-in"
            ? "Log in to access your Lumina AI workspace"
            : "Sign up to start using your personal AI assistant"}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "sign-up" && (
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs font-medium text-foreground">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-input/60 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-xs font-medium text-foreground">Email Address</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-input/60 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-xs font-medium text-foreground">Password</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-input/60 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer"
        >
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : (
            <>
              {mode === "sign-in" ? "Log In to Lumina AI" : "Create Account"}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="relative my-5 text-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border/60" />
        </div>
        <span className="relative bg-card px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
          Or Access Instantly
        </span>
      </div>

      <button
        type="button"
        onClick={handleDemoLogin}
        disabled={isLoading}
        className="w-full py-2.5 px-4 rounded-xl border border-border bg-secondary/40 hover:bg-secondary text-foreground text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <Sparkles className="w-4 h-4 text-primary" />
        Instant Workspace Access (Demo Account)
      </button>

      <div className="mt-5 text-center">
        {mode === "sign-in" ? (
          <p className="text-xs text-muted-foreground">
            Don't have an account?{" "}
            <button
              onClick={() => { setMode("sign-up"); setError(null); }}
              className="text-primary font-medium hover:underline cursor-pointer"
            >
              Sign up here
            </button>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Already have an account?{" "}
            <button
              onClick={() => { setMode("sign-in"); setError(null); }}
              className="text-primary font-medium hover:underline cursor-pointer"
            >
              Log in here
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
