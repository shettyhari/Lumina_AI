import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  role?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lumina_session_token");
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Validate active session token on load
  useEffect(() => {
    let active = true;

    async function checkAuthStatus() {
      const storedToken = localStorage.getItem("lumina_session_token");
      
      if (!storedToken) {
        if (active) {
          setUser(null);
          setToken(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`${basePath}/api/auth/me`, {
          headers: {
            "Authorization": `Bearer ${storedToken}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          if (active) {
            setUser(data.user);
            setToken(storedToken);
          }
        } else {
          // Token expired, invalid, or server rejected the session — fail closed.
          // Never trust an unverified local copy of the user as a substitute
          // for a server-validated session.
          localStorage.removeItem("lumina_session_token");
          localStorage.removeItem("lumina_user_session");
          localStorage.removeItem("lumina_admin_session");
          if (active) {
            setUser(null);
            setToken(null);
          }
        }
      } catch {
        // Network or server error — cannot verify the session, so fail closed
        // rather than trusting unverified local state.
        if (active) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    checkAuthStatus();
    return () => { active = false; };
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      let data: any = null;
      let ok = false;
      try {
        const response = await fetch(`${basePath}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          credentials: "include",
        });
        ok = response.ok;
        data = await response.json().catch(() => null);
      } catch {
        throw new Error("Unable to reach the server. Please check your connection and try again.");
      }

      if (!ok) {
        throw new Error(data?.error || "Authentication failed. Please try again.");
      }

      const newToken = data.token;
      const newUser = data.user;

      localStorage.setItem("lumina_session_token", newToken);
      localStorage.setItem("lumina_user_session", JSON.stringify(newUser));
      localStorage.setItem("lumina_admin_session", newUser.role === "admin" ? "true" : "false");

      setToken(newToken);
      setUser(newUser);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, displayName?: string): Promise<void> => {
    setIsLoading(true);
    try {
      let data: any = null;
      let ok = false;
      try {
        const response = await fetch(`${basePath}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, displayName }),
          credentials: "include",
        });
        ok = response.ok;
        data = await response.json().catch(() => null);
      } catch {
        throw new Error("Unable to reach the server. Please check your connection and try again.");
      }

      if (!ok) {
        throw new Error(data?.error || "Registration failed. Please try again.");
      }

      const newToken = data.token;
      const newUser = data.user;

      localStorage.setItem("lumina_session_token", newToken);
      localStorage.setItem("lumina_user_session", JSON.stringify(newUser));
      localStorage.setItem("lumina_admin_session", newUser.role === "admin" ? "true" : "false");

      setToken(newToken);
      setUser(newUser);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch(`${basePath}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    } finally {
      localStorage.removeItem("lumina_session_token");
      localStorage.removeItem("lumina_user_session");
      localStorage.removeItem("lumina_admin_session");
      setUser(null);
      setToken(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user && token),
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
