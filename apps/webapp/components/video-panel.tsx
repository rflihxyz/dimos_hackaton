"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { videoUrl } from "@/lib/media";

type VideoStatus = "loading" | "live" | "down";

export function VideoPanel() {
  const [status, setStatus] = useState<VideoStatus>("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status !== "down") return;
    const id = setTimeout(() => setTick((t) => t + 1), 2000);
    return () => clearTimeout(id);
  }, [status, tick]);

  const src = `${videoUrl()}?t=${tick}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-medium">Robot camera</CardTitle>
        <StatusBadge status={status} />
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative aspect-video w-full bg-black">
          {status === "loading" && (
            <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
          )}
          {/* MJPEG stream is just an <img> tag — the browser will keep the
              connection open until it errors. We swap a cache-busting query
              param on every reconnect attempt. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={tick}
            src={src}
            alt="Live robot camera feed"
            className="absolute inset-0 h-full w-full object-contain"
            onLoad={() => setStatus("live")}
            onError={() => setStatus("down")}
          />
          {status === "down" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-center text-sm text-neutral-300">
              <div>
                <p className="font-medium">No video stream</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Start dimos with{" "}
                  <code className="rounded bg-neutral-800 px-1 py-0.5">
                    dimos --simulation run dimos-hackathon-agentic
                  </code>
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: VideoStatus }) {
  if (status === "live") {
    return (
      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
        Live
      </Badge>
    );
  }
  if (status === "down") {
    return <Badge variant="destructive">Down</Badge>;
  }
  return <Badge variant="secondary">Connecting…</Badge>;
}
