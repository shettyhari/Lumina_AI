import { Link } from "wouter";
import { Sparkles, Zap, Shield, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 relative overflow-hidden flex flex-col">
      {/* Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-iridescent opacity-20 blur-[120px] rounded-full pointer-events-none mix-blend-screen"></div>
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-indigo-500/20 blur-[150px] rounded-full pointer-events-none mix-blend-screen"></div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-iridescent shadow-xl shadow-primary/20">
            <img src={`${import.meta.env.BASE_URL}logo.svg`.replace('//', '/')} alt="Lina Logo" className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Lina</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <div className="text-sm font-medium text-muted-foreground hover:text-white transition-colors cursor-pointer px-4 py-2">
              Sign In
            </div>
          </Link>
          <Link href="/sign-up">
            <div className="text-sm font-medium bg-white text-black px-5 py-2.5 rounded-full hover:bg-white/90 transition-all cursor-pointer shadow-lg shadow-white/10 flex items-center gap-2">
              Get Started <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 relative z-10 flex flex-col items-center justify-center text-center px-4 pt-20 pb-32">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-cyan-50">Introducing Lina OS 1.0</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter max-w-4xl leading-[1.1] mb-8">
          Your mind, <br className="hidden md:block" />
          <span className="text-iridescent">amplified.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-12 leading-relaxed">
          Step into a premium, thoughtful workspace. Lina isn't just a chat interface—it's a deeply personal intelligence that listens, remembers, and responds with real substance.
        </p>
        
        <Link href="/sign-up">
          <div className="group relative inline-flex items-center justify-center gap-2 bg-white text-black px-8 py-4 rounded-full font-medium text-lg hover:scale-105 transition-all duration-300 cursor-pointer shadow-[0_0_40px_rgba(255,255,255,0.2)]">
            Start Thinking Together
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            <div className="absolute inset-0 rounded-full ring-1 ring-white/50 ring-offset-2 ring-offset-background group-hover:ring-offset-4 transition-all duration-300"></div>
          </div>
        </Link>
      </main>

      {/* Features */}
      <section className="relative z-10 bg-black/40 border-t border-white/5 backdrop-blur-xl py-24">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="flex flex-col items-start text-left">
            <div className="h-12 w-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-6 border border-indigo-500/30">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-white">Fluid Interaction</h3>
            <p className="text-muted-foreground leading-relaxed">
              Experience zero-latency streaming responses that feel like a continuous thought process. The interface disappears, leaving just you and the ideas.
            </p>
          </div>
          
          <div className="flex flex-col items-start text-left">
            <div className="h-12 w-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-6 border border-cyan-500/30">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-white">Visual Synthesis</h3>
            <p className="text-muted-foreground leading-relaxed">
              Don't just talk—create. Generate stunning, high-resolution imagery directly within your workspace without breaking your creative flow.
            </p>
          </div>
          
          <div className="flex flex-col items-start text-left">
            <div className="h-12 w-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-6 border border-purple-500/30">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-white">Deep Context</h3>
            <p className="text-muted-foreground leading-relaxed">
              Lina organizes your thoughts intuitively. Pin important conversations, search past insights, and maintain context across sessions seamlessly.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}