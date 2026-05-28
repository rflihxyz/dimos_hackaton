"use client";

import { Send, ShieldAlert, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, ApiError } from "@/lib/api";
import { agentIdleSseUrl, agentSseUrl } from "@/lib/media";

/**
 * Real-time chat with the running robot agent.
 *
 * - Sending: `POST /agents/send` (broker → dispatcher → dimos). The broker
 *   serialises turns and gates every tool call against the caller's role.
 * - Receiving: two SSE streams from dimos (`agent_responses`, `agent_idle`)
 *   carry the agent's live message stream and idle/busy state. Messages
 *   are JSON-encoded `{kind, ...}` objects; we render each kind distinctly
 *   and visually flag RBAC/policy denials so it's obvious when the
 *   guardrails fire.
 *
 * The SSE bus is global to dimos (one shared LCM topic), so anyone on
 * /chat sees every other operator's exchange. That's the trade-off for
 * keeping the dimos package vendored as-is — fine for one robot.
 */

type StreamEvent =
  | { kind: "human"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "tool_call"; name: string; args: Record<string, unknown> }
  | { kind: "tool_result"; text: string; denied: boolean }
  | { kind: "system"; text: string };

type Message =
  | { id: string; kind: "user"; text: string; at: number }
  | { id: string; kind: "system_error"; text: string; at: number }
  | { id: string; kind: "stream"; event: StreamEvent; at: number };

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agentIdle, setAgentIdle] = useState<boolean | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to dimos's agent message stream
  useEffect(() => {
    const source = new EventSource(agentSseUrl());
    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);
    source.onmessage = (e) => {
      if (!e.data) return;
      let event: StreamEvent;
      try {
        event = JSON.parse(e.data) as StreamEvent;
      } catch {
        // Pre-bridge legacy events still emit raw text; show them as
        // system messages so we don't drop anything during a rolling
        // upgrade of the dimos process.
        event = { kind: "system", text: String(e.data) };
      }
      // Skip incoming HumanMessages — we already added the user input
      // optimistically when they hit send. Showing both would duplicate.
      if (event.kind === "human") return;
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), kind: "stream", event, at: Date.now() },
      ]);
    };
    return () => source.close();
  }, []);

  // Subscribe to agent idle/busy state
  useEffect(() => {
    const source = new EventSource(agentIdleSseUrl());
    source.onmessage = (e) => {
      if (!e.data) return;
      setAgentIdle(e.data === "1");
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, agentIdle]);

  const send = async () => {
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "user", text: message, at: Date.now() },
    ]);
    try {
      await api.sendAgentMessage(message);
    } catch (e) {
      const detail =
        e instanceof ApiError
          ? typeof e.detail === "string"
            ? e.detail
            : e.message
          : (e as Error).message;
      toast.error(`Send failed: ${detail}`);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "system_error",
          text: `Failed: ${detail}`,
          at: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const showThinking = sending || agentIdle === false;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-medium">Agent chat</CardTitle>
          <CardDescription>
            Talk to the running robot agent. RBAC and policies are enforced
            per skill call; denials show in red.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {streamConnected ? (
            <Badge variant="secondary" className="text-[10px]">
              stream
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              offline
            </Badge>
          )}
          {showThinking ? (
            <Badge variant="secondary">working…</Badge>
          ) : (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">ready</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 min-h-0 flex-col gap-3 p-3 pt-0">
        <ScrollArea className="flex-1 rounded-md border">
          <div ref={scrollerRef} className="space-y-3 p-3 text-sm">
            {messages.length === 0 && !showThinking && (
              <p className="text-muted-foreground">
                Send a message to start. Try{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  walk forward 1 metre
                </code>
                {" "}or{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  what do you see?
                </code>
                .
              </p>
            )}
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
            {showThinking && <ThinkingRow />}
          </div>
        </ScrollArea>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the agent..."
            disabled={sending}
          />
          <Button type="submit" size="icon" disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MessageRow({ message }: { message: Message }) {
  if (message.kind === "user") {
    return (
      <Row label="you" labelClass="text-muted-foreground">
        <span className="whitespace-pre-wrap break-words">{message.text}</span>
      </Row>
    );
  }
  if (message.kind === "system_error") {
    return (
      <Row label="error" labelClass="text-destructive">
        <span className="whitespace-pre-wrap break-words text-destructive">
          {message.text}
        </span>
      </Row>
    );
  }
  const event = message.event;
  if (event.kind === "agent") {
    return (
      <Row label="agent" labelClass="text-foreground">
        <span className="whitespace-pre-wrap break-words">{event.text}</span>
      </Row>
    );
  }
  if (event.kind === "tool_call") {
    return (
      <Row label="tool" labelClass="text-blue-500">
        <code className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
          <Wrench className="h-3 w-3" />
          {event.name}({formatArgs(event.args)})
        </code>
      </Row>
    );
  }
  if (event.kind === "tool_result") {
    if (event.denied) {
      return (
        <Row label="denied" labelClass="text-destructive">
          <span className="inline-flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-pre-wrap break-words">
              {event.text}
            </span>
          </span>
        </Row>
      );
    }
    return (
      <Row label="result" labelClass="text-muted-foreground">
        <span className="whitespace-pre-wrap break-words text-muted-foreground">
          {event.text}
        </span>
      </Row>
    );
  }
  // system
  return (
    <Row label="system" labelClass="text-amber-500">
      <span className="whitespace-pre-wrap break-words text-muted-foreground">
        {event.text}
      </span>
    </Row>
  );
}

function Row({
  label,
  labelClass,
  children,
}: {
  label: string;
  labelClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <span
        className={`shrink-0 w-14 text-xs font-semibold uppercase tracking-wide ${labelClass}`}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ThinkingRow() {
  return (
    <Row label="agent" labelClass="text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
        <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:200ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:400ms]" />
        <span className="italic">thinking…</span>
      </span>
    </Row>
  );
}

function formatArgs(args: Record<string, unknown>): string {
  // Compact JSON-ish: drop quotes around keys but keep values quoted
  // — close to how humancli renders tool_calls. Skip if no args.
  const keys = Object.keys(args);
  if (keys.length === 0) return "";
  return keys
    .map((k) => `${k}=${JSON.stringify(args[k])}`)
    .join(", ");
}
