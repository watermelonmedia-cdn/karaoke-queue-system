import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import HostPage from "./pages/Host";
import HostLoginPage from "./pages/HostLogin";
import HostArchivePage from "./pages/HostArchive";
import HostSettingsPage from "./pages/HostSettings";
import Header from "@/components/Header";

const queryClient = new QueryClient();

import { getSettings, clearAllPublicEvents } from "@/lib/karaoke";

// Expose clearAllPublicEvents to window for debugging
if (typeof window !== "undefined") {
  (window as any).clearAllPublicEvents = clearAllPublicEvents;
}

function Layout() {
  const settings = getSettings();
  return (
    <div className="stage-bg min-h-screen text-foreground">
      <div className="stage-content flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 py-6 sm:py-8">
          <Outlet />
        </main>
        <footer className="mt-12">
          <div className="rule-gold opacity-40" />
          <p className="py-6 text-center text-xs tracking-wide text-muted-foreground">
            {settings.footerText}
          </p>
        </footer>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Index />} />
            <Route path="/host/login" element={<HostLoginPage />} />
            <Route path="/host" element={<HostPage />} />
            <Route path="/host/archive" element={<HostArchivePage />} />
            <Route path="/host/settings" element={<HostSettingsPage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

const container = document.getElementById("root")!;
// Reuse the existing root if it was already created (prevents duplicate createRoot warnings in dev/HMR)
const existingRoot = (window as any).__app_root;
if (existingRoot) {
  existingRoot.render(<App />);
} else {
  const root = createRoot(container);
  root.render(<App />);
  (window as any).__app_root = root;
}
