/**
 * Direct browser→dimos media URLs.
 *
 * MJPEG video and the agent SSE text stream are pulled directly from
 * the dimos webserver on :5555 (it sets `allow_origins=["*"]`). We do
 * NOT proxy these through FastAPI — the browser is faster and we avoid
 * a backpressure bottleneck on the broker.
 */

const DIMOS_BASE =
  process.env.NEXT_PUBLIC_DIMOS_URL ?? "http://localhost:5555";

export function videoUrl(): string {
  return `${DIMOS_BASE}/video_feed/color_image`;
}

export function agentSseUrl(): string {
  return `${DIMOS_BASE}/text_stream/agent_responses`;
}

export function agentIdleSseUrl(): string {
  return `${DIMOS_BASE}/text_stream/agent_idle`;
}
