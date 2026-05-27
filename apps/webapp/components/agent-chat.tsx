"use client";

import { Send } from "lucide-react";
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
import { api } from "@/lib/api";
import { agentSseUrl } from "@/lib/media";

type Message = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  at: number;
};

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const url = agentSseUrl();
    const source = new EventSource(url);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      if (!event.data) return;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent",
          text: event.data,
          at: Date.now(),
        },
      ]);
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text: message, at: Date.now() },
    ]);
    setInput("");
    try {
      await api.sendAgentMessage(message);
    } catch (e) {
      toast.error(`Failed to send: ${(e as Error).message}`);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: `Failed: ${(e as Error).message}`,
          at: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-medium">Agent chat</CardTitle>
          <CardDescription>Talk to the running robot agent</CardDescription>
        </div>
        {connected ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-600">connected</Badge>
        ) : (
          <Badge variant="secondary">offline</Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 min-h-0 flex-col gap-3 p-3 pt-0">
        <ScrollArea className="flex-1 rounded-md border">
          <div ref={scrollerRef} className="space-y-2 p-3 text-sm">
            {messages.length === 0 && (
              <p className="text-muted-foreground">
                Send a message to start. Try{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  list_learned_skills
                </code>
                .
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex gap-2">
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {m.role}
                </span>
                <span className="whitespace-pre-wrap break-words">{m.text}</span>
              </div>
            ))}
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
            disabled={busy}
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()}>
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
