"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { AgentChat } from "@/components/agent-chat";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export default function ChatPage() {
  const { user } = useAuth();
  return (
    <div className="flex h-[calc(100dvh-3rem)] w-full flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Chat</h1>
          <p className="text-muted-foreground">
            Acting as{" "}
            <span className="font-medium text-foreground">
              {user?.username ?? "—"}
            </span>{" "}
            (role{" "}
            <span className="font-medium text-foreground">
              {user?.role ?? "—"}
            </span>
            ). Every skill the agent tries is checked against your role and
            active policies.
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <AgentChat />
      </div>
    </div>
  );
}
