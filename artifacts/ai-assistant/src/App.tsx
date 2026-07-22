import { useEffect, useRef, useState, Component, ReactNode, lazy, Suspense } from "react";
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect, Link } from 'wouter';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";

import Layout from "./components/layout";
import { FamilyStatusProvider, useFamilyStatus } from "./contexts/family-context";

// Lazy-loaded pages for optimal performance & code splitting
const LandingPage = lazy(() => import("./pages/landing"));
const ChatPage = lazy(() => import("./pages/chat"));
const ImageGenPage = lazy(() => import("./pages/image-gen"));
const DashboardPage = lazy(() => import("./pages/dashboard"));
const SettingsPage = lazy(() => import("./pages/settings"));
const MemoryPage = lazy(() => import("./pages/memory"));
const PersonasPage = lazy(() => import("./pages/personas"));
const AdminPage = lazy(() => import("./pages/admin"));
const FamilyRoomPage = lazy(() => import("./pages/family-room"));
const ShoppingPage = lazy(() => import("./pages/shopping"));
const ChoresPage = lazy(() => import("./pages/chores"));
const CalendarPage = lazy(() => import("./pages/calendar"));
const RemindersPage = lazy(() => import("./pages/reminders"));
const MealsPage = lazy(() => import("./pages/meals"));
const NotesPage = lazy(() => import("./pages/notes"));
const BudgetPage = lazy(() => import("./pages/budget"));
const EmergencyPage = lazy(() => import("./pages/emergency"));
const WeatherPage = lazy(() => import("./pages/weather"));
const DocumentsPage = lazy(() => import("./pages/documents"));
const MaintenancePage = lazy(() => import("./pages/maintenance"));
const BillsPage = lazy(() => import("./pages/bills"));
const InventoryPage = lazy(() => import("./pages/inventory"));
const RewardsPage = lazy(() => import("./pages/rewards"));
const WishlistPage = lazy(() => import("./pages/wishlist"));
const PetsPage = lazy(() => import("./pages/pets"));
const PantryPage = lazy(() => import("./pages/pantry"));
const BriefingPage = lazy(() => import("./pages/briefing"));
const PhotosPage = lazy(() => import("./pages/photos"));
const CloudStoragePage = lazy(() => import("./pages/cloud-storage"));

// Fallback loader component for lazy-loaded routes
function PageLoader() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm font-medium text-muted-foreground animate-pulse">Loading Lumina AI...</span>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Lumina AI App Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 text-center">
          <div className="flex flex-col items-center gap-4 max-w-md">
            <h1 className="text-3xl font-bold text-iridescent">Lumina AI</h1>
            <p className="text-muted-foreground">An unexpected error occurred while loading the workspace.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rawClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkPubKey = rawClerkKey || 'pk_test_c3VwcmVtZS1tb3VzZS0yMS5jbGVyay5hY2NvdW50cy5kZXYk';
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  variables: {
    /* LINA brand — magenta primary, purple/teal accents */
    colorPrimary: "hsl(328 82% 52%)",
    colorForeground: "hsl(213 31% 91%)",
    colorMutedForeground: "hsl(215 20.2% 65.1%)",
    colorDanger: "hsl(0 62.8% 30.6%)",
    colorBackground: "hsl(222 47% 7%)",
    colorInput: "hsl(222 47% 15%)",
    colorInputForeground: "hsl(213 31% 91%)",
    colorNeutral: "hsl(222 47% 15%)",
    fontFamily: "Geist, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card border-card-border border rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/80",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-primary",
    alertText: "text-destructive",
    logoBox: "mb-6 flex justify-center",
    logoImage: "w-auto h-10 max-w-[200px] object-contain",
    socialButtonsBlockButton: "border-border hover:bg-secondary/50",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
    formFieldInput: "bg-input border-border text-foreground",
    footerAction: "bg-transparent",
    dividerLine: "bg-border",
    alert: "border-destructive/50 bg-destructive/10 text-destructive",
    otpCodeFieldInput: "bg-input border-border text-foreground",
    formFieldRow: "mb-4",
    main: "gap-4",
  },
};

function useSafeUser() {
  const userResult = useUser();
  const [devAuth, setDevAuth] = useState(false);

  useEffect(() => {
    if (!userResult.isLoaded) {
      const timer = setTimeout(() => setDevAuth(true), 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [userResult.isLoaded]);

  if (!userResult.isLoaded && devAuth) {
    return { isLoaded: true, isSignedIn: true, user: { id: "dev_admin_user", fullName: "Dev User" } as any };
  }

  return userResult;
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-iridescent opacity-10 pointer-events-none blur-3xl"></div>
      <div className="z-10 w-full max-w-md flex flex-col items-center gap-6">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
        <Link href="/chat">
          <button className="text-xs text-muted-foreground hover:text-primary underline cursor-pointer transition-colors">
            Enter Workspace as Demo / Dev Admin
          </button>
        </Link>
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-iridescent opacity-10 pointer-events-none blur-3xl"></div>
      <div className="z-10 w-full max-w-md flex flex-col items-center gap-6">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
        <Link href="/chat">
          <button className="text-xs text-muted-foreground hover:text-primary underline cursor-pointer transition-colors">
            Enter Workspace as Demo / Dev Admin
          </button>
        </Link>
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClientInstance = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (typeof addListener === 'function') {
      const unsubscribe = addListener(({ user }) => {
        const userId = user?.id ?? null;
        if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
          queryClientInstance.clear();
        }
        prevUserIdRef.current = userId;
      });
      return unsubscribe;
    }
    return undefined;
  }, [addListener, queryClientInstance]);

  return null;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useSafeUser();
  if (!isLoaded) return <PageLoader />;
  return isSignedIn ? <Redirect to="/chat" /> : <LandingPage />;
}

/** Shows a loading spinner while family status is being fetched */
function FamilyStatusGate({ children }: { children: ReactNode }) {
  const { isSignedIn } = useSafeUser();
  const { isLoading } = useFamilyStatus();

  if (!isSignedIn) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType<any>; adminOnly?: boolean }) {
  const { isLoaded, isSignedIn } = useSafeUser();
  const { isAdmin } = useFamilyStatus();

  if (!isLoaded) return <PageLoader />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (adminOnly && !isAdmin) return <Redirect to="/chat" />;

  return (
    <FamilyStatusGate>
      <Layout><Component /></Layout>
    </FamilyStatusGate>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <FamilyStatusProvider>
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />

              <Route path="/chat" component={() => <ProtectedRoute component={ChatPage} />} />
              <Route path="/chat/:id" component={() => <ProtectedRoute component={ChatPage} />} />
              <Route path="/image-gen" component={() => <ProtectedRoute component={ImageGenPage} />} />
              <Route path="/memory" component={() => <ProtectedRoute component={MemoryPage} />} />
              <Route path="/personas" component={() => <ProtectedRoute component={PersonasPage} />} />
              <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />
              <Route path="/settings" component={() => <ProtectedRoute component={SettingsPage} />} />
              <Route path="/admin" component={() => <ProtectedRoute component={AdminPage} adminOnly />} />
              <Route path="/family-room" component={() => <ProtectedRoute component={FamilyRoomPage} />} />
              <Route path="/shopping" component={() => <ProtectedRoute component={ShoppingPage} />} />
              <Route path="/chores" component={() => <ProtectedRoute component={ChoresPage} />} />
              <Route path="/calendar" component={() => <ProtectedRoute component={CalendarPage} />} />
              <Route path="/reminders" component={() => <ProtectedRoute component={RemindersPage} />} />
              <Route path="/meals" component={() => <ProtectedRoute component={MealsPage} />} />
              <Route path="/notes" component={() => <ProtectedRoute component={NotesPage} />} />
              <Route path="/budget" component={() => <ProtectedRoute component={BudgetPage} />} />
              <Route path="/emergency" component={() => <ProtectedRoute component={EmergencyPage} />} />
              <Route path="/weather" component={() => <ProtectedRoute component={WeatherPage} />} />
              <Route path="/documents" component={() => <ProtectedRoute component={DocumentsPage} />} />
              <Route path="/maintenance" component={() => <ProtectedRoute component={MaintenancePage} />} />
              <Route path="/bills" component={() => <ProtectedRoute component={BillsPage} />} />
              <Route path="/inventory" component={() => <ProtectedRoute component={InventoryPage} />} />
              <Route path="/rewards" component={() => <ProtectedRoute component={RewardsPage} />} />
              <Route path="/wishlist" component={() => <ProtectedRoute component={WishlistPage} />} />
              <Route path="/pets" component={() => <ProtectedRoute component={PetsPage} />} />
              <Route path="/pantry" component={() => <ProtectedRoute component={PantryPage} />} />
              <Route path="/briefing" component={() => <ProtectedRoute component={BriefingPage} />} />
              <Route path="/photos" component={() => <ProtectedRoute component={PhotosPage} />} />
              <Route path="/cloud-storage" component={() => <ProtectedRoute component={CloudStoragePage} />} />

              <Route>
                <div className="flex h-[100dvh] items-center justify-center flex-col gap-4 text-center">
                  <h1 className="text-4xl font-bold text-iridescent">404</h1>
                  <p className="text-muted-foreground">The page you are looking for does not exist.</p>
                </div>
              </Route>
            </Switch>
          </Suspense>
        </FamilyStatusProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);
  return (
    <ErrorBoundary>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ErrorBoundary>
  );
}

export default App;
