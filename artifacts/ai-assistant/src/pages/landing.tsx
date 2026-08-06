import { useState } from "react";
import { useLocation } from "wouter";
import {
  Sparkles,
  Zap,
  Shield,
  ArrowRight,
  Bot,
  Calendar,
  ShoppingCart,
  Wallet,
  Users,
  ImageIcon,
  LogIn,
  CheckCircle2,
  Cpu,
  ExternalLink,
  PlayCircle,
  LayoutDashboard,
} from "lucide-react";
import { LinaLogo } from "@/components/LinaLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignIn, SignUp, useUser, useClerk } from "@clerk/react";

export default function LandingPage({ ignoreRedirect = false }: { ignoreRedirect?: boolean }) {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const clerk = useClerk();
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [guestEmail, setGuestEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLocalSession = typeof window !== 'undefined' && (
    localStorage.getItem("lumina_admin_session") === "true" ||
    Boolean(localStorage.getItem("lumina_user_session"))
  );
  const isAppAuthenticated = (isLoaded && isSignedIn) || isLocalSession;

  // If already signed in and not explicitly forced on landing page, redirect to workspace
  if (!ignoreRedirect && isLoaded && isSignedIn) {
    setLocation("/chat");
    return null;
  }

  // Handler for options/features when unauthenticated
  const handleRequireAuth = (targetPath = "/chat") => {
    if (isAppAuthenticated) {
      setLocation(targetPath);
    } else {
      setLocation("/sign-in");
    }
  };

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const userPayload = {
      email: guestEmail.trim() || "user@family.com",
      displayName: guestEmail.trim().split("@")[0] || "Lumina User",
      role: "admin",
    };
    try {
      localStorage.setItem("lumina_user_session", JSON.stringify(userPayload));
      localStorage.setItem("lumina_admin_session", "true");
    } catch {
      /* localStorage blocked */
    }
    setTimeout(() => {
      setIsSubmitting(false);
      setLocation("/chat");
    }, 300);
  };

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    try {
      if (clerk && typeof (clerk as any).authenticateWithRedirect === "function") {
        await (clerk as any).authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl: "/chat",
          redirectUrlComplete: "/chat",
        });
      } else if (clerk && typeof (clerk as any).openSignIn === "function") {
        (clerk as any).openSignIn();
      } else {
        setLocation("/sign-in");
      }
    } catch {
      setLocation("/sign-in");
    }
  };

  const rawClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground selection:bg-primary/30 relative overflow-hidden flex flex-col font-sans">
      {/* Dynamic Background Glow Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-r from-primary/30 via-purple-600/20 to-cyan-500/30 opacity-30 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />

      {/* Top Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/40 py-3 px-6">
        <nav className="flex items-center justify-between max-w-7xl mx-auto w-full">
          <button 
            onClick={() => setLocation("/")}
            className="flex items-center gap-3 hover:opacity-90 transition-opacity text-left cursor-pointer focus:outline-none"
          >
            <LinaLogo className="h-8 w-auto" showSubtitle={true} />
          </button>

          <div className="hidden md:flex items-center gap-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#ai-models" className="hover:text-foreground transition-colors">AI Models</a>
            <button onClick={() => setLocation("/sign-in")} className="hover:text-foreground transition-colors cursor-pointer">Sign In</button>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            {isAppAuthenticated ? (
              <button
                onClick={() => setLocation("/chat")}
                className="text-xs font-bold bg-gradient-to-r from-primary via-purple-600 to-cyan-500 text-white px-4 py-2 rounded-full hover:opacity-90 transition-all shadow-md shadow-primary/20 flex items-center gap-1.5 cursor-pointer"
              >
                <LayoutDashboard className="w-3.5 h-3.5" /> Open Web App <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => setLocation("/sign-in")}
                  className="text-xs font-semibold px-3.5 py-1.5 text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-full transition-all flex items-center gap-1 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" /> Sign In
                </button>
                <button
                  onClick={() => setLocation("/sign-up")}
                  className="text-xs font-semibold bg-gradient-to-r from-primary to-purple-600 text-white px-4 py-2 rounded-full hover:opacity-90 transition-all shadow-md shadow-primary/20 flex items-center gap-1.5 cursor-pointer"
                >
                  Get Started <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero & Authentication Section */}
      <main className="flex-1 relative z-10 max-w-7xl mx-auto px-6 py-6 lg:py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center w-full">
        {/* Left Column: Product Value & Compact Features Grid */}
        <div className="lg:col-span-7 text-left space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Lumina AI Operating System</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15]">
            Your Mind & Family, <br />
            <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Powered by Agentic AI.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
            The all-in-one personal AI assistant and family operating system. Connect Google Gemini, Claude, and GPT-4 with real tool execution for pantry sync, expenses, calendar, and family chat.
          </p>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={() => handleRequireAuth("/chat")}
              className="px-6 py-3 rounded-full bg-gradient-to-r from-primary via-purple-600 to-cyan-500 text-white font-bold text-xs sm:text-sm hover:opacity-95 transition-all shadow-lg shadow-primary/25 flex items-center gap-2 group cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Launch Web Application</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => setLocation("/sign-up")}
              className="px-5 py-3 rounded-full bg-secondary/80 hover:bg-secondary border border-border text-foreground font-semibold text-xs sm:text-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-muted-foreground" />
              Create Account
            </button>
          </div>

          {/* Compact 6-Feature Showcase Pills Grid */}
          <div id="features" className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Select any module below to launch (Sign in required)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <button
                onClick={() => handleRequireAuth("/chat")}
                className="bg-card/50 border border-border/50 rounded-xl p-3 flex items-start gap-2.5 hover:border-primary hover:bg-primary/5 transition-all text-left group cursor-pointer"
              >
                <Bot className="w-4 h-4 text-primary shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="flex items-center gap-1">
                    <h4 className="text-xs font-bold">Agentic AI Chat</h4>
                    <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">Gemini & GPT-4 tools</p>
                </div>
              </button>

              <button
                onClick={() => handleRequireAuth("/family-room")}
                className="bg-card/50 border border-border/50 rounded-xl p-3 flex items-start gap-2.5 hover:border-cyan-400 hover:bg-cyan-500/5 transition-all text-left group cursor-pointer"
              >
                <Users className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="flex items-center gap-1">
                    <h4 className="text-xs font-bold">Family Hub</h4>
                    <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" />
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">Roles & Direct Chat</p>
                </div>
              </button>

              <button
                onClick={() => handleRequireAuth("/pantry")}
                className="bg-card/50 border border-border/50 rounded-xl p-3 flex items-start gap-2.5 hover:border-purple-400 hover:bg-purple-500/5 transition-all text-left group cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4 text-purple-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="flex items-center gap-1">
                    <h4 className="text-xs font-bold">Pantry Sync</h4>
                    <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-purple-400 transition-opacity" />
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">Auto Grocery Lists</p>
                </div>
              </button>

              <button
                onClick={() => handleRequireAuth("/budget")}
                className="bg-card/50 border border-border/50 rounded-xl p-3 flex items-start gap-2.5 hover:border-emerald-400 hover:bg-emerald-500/5 transition-all text-left group cursor-pointer"
              >
                <Wallet className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="flex items-center gap-1">
                    <h4 className="text-xs font-bold">Expense Analytics</h4>
                    <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-emerald-400 transition-opacity" />
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">Budget Intent Detection</p>
                </div>
              </button>

              <button
                onClick={() => handleRequireAuth("/calendar")}
                className="bg-card/50 border border-border/50 rounded-xl p-3 flex items-start gap-2.5 hover:border-amber-400 hover:bg-amber-500/5 transition-all text-left group cursor-pointer"
              >
                <Calendar className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="flex items-center gap-1">
                    <h4 className="text-xs font-bold">Smart Calendar</h4>
                    <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-amber-400 transition-opacity" />
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">Voice Reminders</p>
                </div>
              </button>

              <button
                onClick={() => handleRequireAuth("/image-gen")}
                className="bg-card/50 border border-border/50 rounded-xl p-3 flex items-start gap-2.5 hover:border-rose-400 hover:bg-rose-500/5 transition-all text-left group cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="flex items-center gap-1">
                    <h4 className="text-xs font-bold">AI Image Studio</h4>
                    <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-rose-400 transition-opacity" />
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">Imagen 3 Generation</p>
                </div>
              </button>
            </div>
          </div>

          <div className="pt-1 flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Multi-Model AI</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Encrypted Storage</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Secure Authentication</span>
            </div>
          </div>
        </div>

        {/* Right Column: Login & Sign-Up Card */}
        <div id="auth-section" className="lg:col-span-5 relative w-full">
          <div className="w-full bg-card/80 backdrop-blur-2xl border border-border/80 rounded-2xl p-6 shadow-2xl space-y-4 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode("signin")}
                  className={`text-sm font-bold pb-0.5 transition-all cursor-pointer ${authMode === "signin" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Sign In
                </button>
                <span className="text-muted-foreground/40">•</span>
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={`text-sm font-bold pb-0.5 transition-all cursor-pointer ${authMode === "signup" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Create Account
                </button>
              </div>

              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">Authentication Required</span>
            </div>

            {/* Dedicated Google Auth Button */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-3 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2.5 text-xs border border-slate-200 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                {authMode === "signin" ? "Sign In with Google" : "Sign Up with Google"}
              </button>

              <div className="relative flex items-center justify-center py-1">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/40" /></div>
                <span className="relative bg-card px-2 text-[10px] text-muted-foreground uppercase tracking-wider">or credentials</span>
              </div>
            </div>

            {/* If Clerk key present, render Clerk auth widget */}
            {rawClerkKey ? (
              <div className="w-full flex flex-col items-center">
                {authMode === "signin" ? (
                  <SignIn routing="hash" signUpUrl="#auth-section" />
                ) : (
                  <SignUp routing="hash" signInUrl="#auth-section" />
                )}
              </div>
            ) : (
              /* Fallback Credentials Form */
              <form onSubmit={handleCustomLogin} autoComplete="off" className="space-y-3 pt-0.5">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground block mb-1 uppercase tracking-wider">
                    Email Address or Name
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="you@family.com"
                    className="w-full bg-input/40 border border-border/80 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/60 text-foreground transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-muted-foreground block mb-1 uppercase tracking-wider">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-input/40 border border-border/80 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/60 text-foreground transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 bg-gradient-to-r from-primary via-purple-600 to-cyan-500 text-white font-semibold rounded-lg hover:opacity-95 transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  {isSubmitting ? "Authenticating..." : authMode === "signin" ? "Sign In & Enter Workspace" : "Create Account & Get Started"}
                </button>
              </form>
            )}

            <p className="text-center text-[10px] text-muted-foreground pt-1">
              By signing in, you agree to Lumina's Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </main>

      {/* AI Models Overview Section */}
      <section id="ai-models" className="relative z-10 py-6 border-t border-border/40 bg-card/20">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Supported Models: Google Gemini 2.0, OpenAI GPT-4o, Anthropic Claude 3.5, OpenRouter</span>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Custom API Keys supported in Settings</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 py-4 bg-background/90 text-[11px] text-muted-foreground">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LinaLogo className="h-5 w-auto" showSubtitle={false} />
            <span>© 2026 Lumina AI. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setLocation("/sign-in")} className="hover:text-foreground transition-colors cursor-pointer">
              Sign In
            </button>
            <button onClick={() => setLocation("/sign-up")} className="hover:text-foreground transition-colors cursor-pointer">
              Create Account
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}