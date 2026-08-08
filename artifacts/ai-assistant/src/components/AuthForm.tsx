import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Lock, Mail, User, ArrowRight, ShieldCheck, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
}

const RESEND_COOLDOWN_SECONDS = 60;

export function AuthForm({ mode: initialMode }: AuthFormProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { login, register, verifySignupOtp, resendSignupOtp } = useAuth();

  // Signup OTP step
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === "sign-in") {
        await login(email, password);
        setLocation("/chat");
      } else {
        await register(email, password, name);
        setAwaitingOtp(true);
        startCooldown();
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setOtpError("Please enter the verification code.");
      return;
    }

    setIsVerifying(true);
    setOtpError(null);

    try {
      await verifySignupOtp(email, otpCode.trim());
      setLocation("/chat");
    } catch (err: any) {
      setOtpError(err?.message || "Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setOtpError(null);
    setResendMessage(null);
    try {
      await resendSignupOtp(email);
      setResendMessage("A new code has been sent.");
      startCooldown();
    } catch (err: any) {
      setOtpError(err?.message || "Failed to resend code. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const handleModeSwitch = (newMode: "sign-in" | "sign-up") => {
    setMode(newMode);
    setError(null);
    setEmail("");
    setPassword("");
    setName("");
    setAwaitingOtp(false);
    setOtpCode("");
    setOtpError(null);
    setResendMessage(null);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    setCooldown(0);
  };

  const backToSignupForm = () => {
    setAwaitingOtp(false);
    setOtpCode("");
    setOtpError(null);
    setResendMessage(null);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    setCooldown(0);
  };

  if (awaitingOtp) {
    return (
      <div className="w-full max-w-md bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden text-left">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-3">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Check Your Email</h2>
          <p className="text-xs text-muted-foreground mt-1">
            We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>

        {otpError && (
          <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2 font-medium">
            <span>{otpError}</span>
          </div>
        )}
        {resendMessage && !otpError && (
          <div className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs flex items-center gap-2 font-medium">
            <span>{resendMessage}</span>
          </div>
        )}

        <form onSubmit={handleVerifyOtp} autoComplete="off" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs font-medium text-foreground">Verification Code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-input/60 border border-border text-center text-2xl tracking-[0.5em] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isVerifying}
            className="mt-2 w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50"
          >
            {isVerifying ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <>
                Verify & Create Account
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 flex flex-col items-center gap-3 text-center">
          <button
            onClick={handleResend}
            disabled={cooldown > 0 || isResending}
            className="text-xs text-primary font-medium hover:underline cursor-pointer disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
          >
            {isResending ? "Sending…" : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          <button
            onClick={backToSignupForm}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>
        </div>
      </div>
    );
  }

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
        <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2 font-medium">
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-4">
        {mode === "sign-up" && (
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs font-medium text-foreground">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
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
              autoComplete="off"
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-input/60 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : (
            <>
              {mode === "sign-in" ? "Log In to Lumina AI" : "Create Account"}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center border-t border-border/40 pt-4">
        {mode === "sign-in" ? (
          <p className="text-xs text-muted-foreground">
            Don't have an account?{" "}
            <button
              onClick={() => handleModeSwitch("sign-up")}
              className="text-primary font-medium hover:underline cursor-pointer"
            >
              Sign up here
            </button>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Already have an account?{" "}
            <button
              onClick={() => handleModeSwitch("sign-in")}
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
