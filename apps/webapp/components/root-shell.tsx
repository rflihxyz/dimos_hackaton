"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-context";

const PUBLIC_ROUTES = new Set(["/login", "/signup"]);

export function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, clearSession } = useAuth();
  const isPublic = PUBLIC_ROUTES.has(pathname);

  // Redirect unauthenticated users to /login. We wait for `ready` so the
  // initial localStorage hydration doesn't trigger a false-negative redirect.
  useEffect(() => {
    if (!ready) return;
    if (!user && !isPublic) {
      router.replace("/login");
    }
  }, [ready, user, isPublic, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  // While bootstrapping auth, or mid-redirect to /login, render nothing
  // to avoid flashing protected UI for a frame.
  if (!ready || !user) {
    return null;
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger className="-ml-1" />
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{user.email}</span>
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => {
                  clearSession();
                  router.replace("/login");
                }}
              >
                Sign out
              </Button>
            </div>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
