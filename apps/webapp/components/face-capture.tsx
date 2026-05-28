"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Mode = "webcam" | "upload";

interface FaceCaptureProps {
  onChange: (blob: Blob | null) => void;
  disabled?: boolean;
}

export function FaceCapture({ onChange, disabled }: FaceCaptureProps) {
  const [mode, setMode] = useState<Mode>("webcam");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const setBlob = (blob: Blob | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(blob ? URL.createObjectURL(blob) : null);
    onChange(blob);
  };

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "webcam" ? "default" : "outline"}
          onClick={() => {
            setBlob(null);
            setMode("webcam");
          }}
          disabled={disabled}
        >
          Webcam
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "upload" ? "default" : "outline"}
          onClick={() => {
            setBlob(null);
            setMode("upload");
          }}
          disabled={disabled}
        >
          Upload
        </Button>
      </div>

      {mode === "webcam" ? (
        <WebcamCapture onCapture={setBlob} disabled={disabled} hasCapture={!!previewUrl} />
      ) : (
        <UploadInput onPick={setBlob} disabled={disabled} />
      )}

      {previewUrl && (
        <div className="rounded-md border bg-muted p-3">
          <p className="mb-2 text-xs text-muted-foreground">Preview</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Captured face preview"
            className="h-40 w-40 rounded-md border object-cover"
          />
        </div>
      )}
    </div>
  );
}

function WebcamCapture({
  onCapture,
  disabled,
  hasCapture,
}: {
  onCapture: (blob: Blob | null) => void;
  disabled?: boolean;
  hasCapture: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStreaming(true);
      } catch (e) {
        setError((e as Error).message ?? "Webcam access denied");
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const onSnap = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      "image/jpeg",
      0.9,
    );
  };

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        Webcam unavailable: {error}
        <br />
        <span className="text-xs">Switch to “Upload” to attach a file instead.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md border bg-black">
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full"
          muted
          playsInline
        />
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onSnap}
        disabled={disabled || !streaming}
      >
        {hasCapture ? "Re-take snapshot" : "Take snapshot"}
      </Button>
    </div>
  );
}

function UploadInput({
  onPick,
  disabled,
}: {
  onPick: (blob: Blob | null) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="file"
      accept="image/jpeg,image/png,image/webp"
      disabled={disabled}
      onChange={(e) => {
        const file = e.target.files?.[0] ?? null;
        onPick(file);
      }}
      className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
    />
  );
}
