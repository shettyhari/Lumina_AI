import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lumina_theme");
      if (saved === "light" || saved === "dark") return saved;
      return document.documentElement.classList.contains("dark") ? "dark" : "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      localStorage.setItem("lumina_theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("lumina_theme", "light");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-label="Toggle theme"
      className={cn(
        "relative p-2 rounded-xl border transition-all duration-300 flex items-center justify-center gap-2",
        "bg-background/80 hover:bg-accent border-border/60 text-foreground shadow-sm hover:shadow-md cursor-pointer",
        className
      )}
    >
      {theme === "dark" ? (
        <>
          <Sun className="w-4 h-4 text-amber-400 animate-in fade-in spin-in-90 duration-200" />
          {showLabel && <span className="text-xs font-medium">Light Mode</span>}
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-indigo-500 animate-in fade-in -spin-in-90 duration-200" />
          {showLabel && <span className="text-xs font-medium">Dark Mode</span>}
        </>
      )}
    </button>
  );
}
