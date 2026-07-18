import { useEffect, useRef, ReactNode } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";

import LandingPage from "./pages/landing";
import ChatPage from "./pages/chat";
import ImageGenPage from "./pages/image-gen";
import DashboardPage from "./pages/dashboard";
import SettingsPage from "./pages/settings";
import MemoryPage from "./pages/memory";
import PersonasPage from "./pages/personas";
import PendingPage from "./pages/pending";
import AdminPage from "./pages/admin";
import FamilyRoomPage from "./pages/family-room";
import ShoppingPage from "./pages/shopping";
import ChoresPage from "./pages/chores";
import CalendarPage from "./pages/calendar";
import RemindersPage from "./pages/reminders";
import MealsPage from "./pages/meals";
import NotesPage from "./pages/notes";
import BudgetPage from "./pages/budget";
import EmergencyPage from "./pages/emergency";
import WeatherPage from "./pages/weather";
import DocumentsPage from "./pages/documents";
import MaintenancePage from "./pages/maintenance";
import BillsPage from "./pages/bills";
import InventoryPage from "./pages/inventory";
import RewardsPage from "./pages/rewards";
import WishlistPage from "./pages/wishlist";
import PetsPage from "./pages/pets";
import PantryPage from "./pages/pantry";
import BriefingPage from "./pages/briefing";
import PhotosPage from "./pages/photos";
import Layout from "./components/layout";
import { FamilyStatusProvider, useFamilyStatus } from "./contexts/family-context";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(243 75% 59%)",
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
    logoImage: "w-12 h-12 object-contain",
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

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-iridescent opacity-10 pointer-events-none blur-3xl"></div>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-iridescent opacity-10 pointer-events-none blur-3xl"></div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClientInstance = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClientInstance.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClientInstance]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/chat" /></Show>
      <Show when="signed-out"><LandingPage /></Show>
    </>
  );
}

/** Shows a loading spinner while family status is being fetched */
function FamilyStatusGate({ children }: { children: ReactNode }) {
  const { isSignedIn } = useUser();
  const { status, isLoading } = useFamilyStatus();

  if (!isSignedIn) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (status === "rejected") return <PendingPage rejected />;
  if (status === "pending") return <PendingPage />;

  return <>{children}</>;
}

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType<any>; adminOnly?: boolean }) {
  const { isAdmin } = useFamilyStatus();

  if (adminOnly && !isAdmin) {
    return (
      <>
        <Show when="signed-in"><Redirect to="/chat" /></Show>
        <Show when="signed-out"><Redirect to="/" /></Show>
      </>
    );
  }

  return (
    <>
      <Show when="signed-in">
        <FamilyStatusGate>
          <Layout><Component /></Layout>
        </FamilyStatusGate>
      </Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
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
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to access your intelligence" } },
        signUp: { start: { title: "Join Lumina", subtitle: "Step into your personal AI space" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <FamilyStatusProvider>
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

            <Route>
              <div className="flex h-[100dvh] items-center justify-center flex-col gap-4 text-center">
                <h1 className="text-4xl font-bold text-iridescent">404</h1>
                <p className="text-muted-foreground">The page you are looking for does not exist.</p>
              </div>
            </Route>
          </Switch>
        </FamilyStatusProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
