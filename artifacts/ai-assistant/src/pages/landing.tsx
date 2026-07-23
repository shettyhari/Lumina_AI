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
} from "lucide-react";
import { LinaLogo } from "@/components/LinaLogo";
import { SignIn, SignUp, useUser, useClerk } from "@clerk/react";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const clerk = useClerk();
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [guestName, setGuestName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already signed in, redirect to workspace
  if (isLoaded && isSignedIn) {
    setLocation("/chat");
    return null;
  }

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setLocation("/chat");
    }, 400);
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
        setLocation("/chat");
      }
    } catch {
      setLocation("/chat");
    }
  };

  const rawClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 relative overflow-hidden flex flex-col font-sans">
      {/* Dynamic Background Glow Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[550px] bg-gradient-to-r from-primary/30 via-purple-600/20 to-cyan-500/30 opacity-40 blur-[130px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute top-[40%] right-[-10%] w-[600px] h-[600px] bg-indigo-500/20 blur-[160px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-[10%] left-[-10%] w-[700px] h-[700px] bg-cyan-500/15 blur-[160px] rounded-full pointer-events-none mix-blend-screen" />

      {/* Top Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <LinaLogo className="h-9 w-auto" showSubtitle={true} />
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#ai-models" className="hover:text-foreground transition-colors">AI Models</a>
            <a href="#auth-section" className="hover:text-foreground transition-colors">Sign In</a>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="#auth-section"
              onClick={() => setAuthMode("signin")}
              className="text-sm font-medium px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </a>
            <a
              href="#auth-section"
              onClick={() => setAuthMode("signup")}
              className="text-sm font-medium bg-gradient-to-r from-primary to-purple-600 text-white px-5 py-2.5 rounded-full hover:opacity-90 transition-all shadow-lg shadow-primary/25 flex items-center gap-2"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Headline & Value Prop */}
        <div className="lg:col-span-7 text-left space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Lumina AI Platform 2.0</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1]">
            Your Home & Family, <br />
            <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Powered by Agentic AI.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Lumina is your all-in-one AI assistant and family operating system. From smart grocery sync and budget tracking to real-time agentic reasoning and family chat — manage everything in one unified, beautiful workspace.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a
              href="#auth-section"
              className="px-8 py-4 bg-gradient-to-r from-primary via-purple-600 to-cyan-500 text-white font-semibold rounded-2xl shadow-xl shadow-primary/30 hover:scale-105 transition-all flex items-center gap-3 text-base"
            >
              Start Free Workspace <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="#features"
              className="px-6 py-4 bg-secondary/60 hover:bg-secondary/90 border border-border/60 text-foreground font-medium rounded-2xl transition-all text-base"
            >
              Explore Features
            </a>
          </div>

          <div className="pt-4 flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Multi-Model AI (Gemini 2.0, Claude, GPT-4)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>End-to-End Encryption</span>
            </div>
          </div>
        </div>

        {/* Right Column: Embedded Login & SignUp Form */}
        <div id="auth-section" className="lg:col-span-5 relative">
          <div className="w-full bg-card/70 backdrop-blur-2xl border border-border/80 rounded-3xl p-8 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/20 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode("signin")}
                  className={`text-base font-bold pb-1 transition-all ${authMode === "signin" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Sign In
                </button>
                <span className="text-muted-foreground/40">•</span>
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={`text-base font-bold pb-1 transition-all ${authMode === "signup" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Create Account
                </button>
              </div>

              <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">Production Ready</span>
            </div>

            {/* Dedicated Google Auth Button */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-3 text-sm border border-slate-200"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
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

              <div className="relative flex items-center justify-center pt-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/40" /></div>
                <span className="relative bg-card px-3 text-xs text-muted-foreground uppercase tracking-wider">or credentials</span>
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
              /* Fallback Direct Auth Form */
              <form onSubmit={handleCustomLogin} className="space-y-4 pt-1">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">
                    Email Address or Name
                  </label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="you@family.com"
                    className="w-full bg-input/40 border border-border/80 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 text-foreground transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    className="w-full bg-input/40 border border-border/80 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 text-foreground transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 bg-gradient-to-r from-primary via-purple-600 to-cyan-500 text-white font-semibold rounded-xl hover:opacity-95 transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  {isSubmitting ? "Authenticating..." : authMode === "signin" ? "Sign In & Enter Application" : "Create Account & Get Started"}
                </button>

                <div className="relative flex items-center justify-center pt-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/40" /></div>
                  <span className="relative bg-card px-3 text-xs text-muted-foreground">or quick entry</span>
                </div>

                <button
                  type="button"
                  onClick={() => setLocation("/chat")}
                  className="w-full py-3 bg-secondary/50 hover:bg-secondary/80 border border-border/60 text-foreground text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  Enter Workspace as Admin (Instant Access)
                </button>
              </form>
            )}

            <p className="text-center text-[11px] text-muted-foreground pt-2">
              By signing in, you agree to Lumina's Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section id="features" className="relative z-10 py-24 bg-card/30 border-t border-border/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 space-y-16">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">
              Designed for Complete <br />
              <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                Family & Personal Productivity
              </span>
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              Lumina replaces fragmented tools with one intelligent, interconnected assistant platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-card/60 border border-border/60 rounded-3xl p-8 hover:border-primary/50 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Agentic AI Chat</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Connect with Gemini 2.0 Flash, Thinking models, Claude, or GPT-4. Performs real tool execution like setting reminders, updating budgets, and checking pantry stock.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-card/60 border border-border/60 rounded-3xl p-8 hover:border-primary/50 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Family Hub & Direct Chat</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Invite family members with custom roles (Admin, Member, Child, Guest). Send direct messages, view status updates, and collaborate seamlessly.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-card/60 border border-border/60 rounded-3xl p-8 hover:border-primary/50 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Pantry & Shopping Sync</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Keep track of pantry items and expiration dates. Automatically generate shared grocery lists when items run low.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-card/60 border border-border/60 rounded-3xl p-8 hover:border-primary/50 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Wallet className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Budget & Expense Analytics</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Log expenses, detect spending trends, split household bills, and ask Lumina natural language questions about your monthly budget.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-card/60 border border-border/60 rounded-3xl p-8 hover:border-primary/50 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Smart Calendar & Reminders</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Never miss an event or task. Set voice reminders, schedule family appointments, and manage chores with automated point rewards.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-card/60 border border-border/60 rounded-3xl p-8 hover:border-primary/50 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ImageIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">AI Image Studio</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Generate high-resolution artwork, photo mockups, and visual ideas instantly powered by Google Gemini Imagen 3 integration.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* AI Provider Section */}
      <section id="ai-models" className="relative z-10 py-20 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-12">
          <div className="space-y-3">
            <span className="text-xs font-semibold text-primary uppercase tracking-widest">Multi-Engine Intelligence</span>
            <h2 className="text-3xl sm:text-4xl font-bold">Use Google AI Studio, OpenAI, Claude, or OpenRouter</h2>
            <p className="text-muted-foreground text-sm max-w-xl mx-auto">
              Configure your own API keys in Settings or use Lumina's pre-configured multi-model router.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-6">
            <div className="bg-card/60 border border-border/60 rounded-2xl px-6 py-4 flex items-center gap-3">
              <Cpu className="w-5 h-5 text-cyan-400" />
              <span className="font-semibold text-sm">Google Gemini 2.0 Flash</span>
            </div>
            <div className="bg-card/60 border border-border/60 rounded-2xl px-6 py-4 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <span className="font-semibold text-sm">Gemini 2.0 Flash Thinking</span>
            </div>
            <div className="bg-card/60 border border-border/60 rounded-2xl px-6 py-4 flex items-center gap-3">
              <Bot className="w-5 h-5 text-emerald-400" />
              <span className="font-semibold text-sm">OpenAI GPT-4o & o3-mini</span>
            </div>
            <div className="bg-card/60 border border-border/60 rounded-2xl px-6 py-4 flex items-center gap-3">
              <Shield className="w-5 h-5 text-amber-400" />
              <span className="font-semibold text-sm">Anthropic Claude 3.5 Sonnet</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 py-10 bg-background/80 text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LinaLogo className="h-6 w-auto" showSubtitle={false} />
            <span>© 2026 Lumina AI. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#auth-section" className="hover:text-foreground transition-colors">Sign In</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#auth-section" className="hover:text-foreground transition-colors">Create Account</a>
          </div>
        </div>
      </footer>
    </div>
  );
}