/**
 * Typed REST client for the FastAPI broker.
 *
 * All calls go through the broker (which then talks to dimos via MCP +
 * Postgres + the shared /recipes volume). Video and the agent text stream
 * are pulled directly from dimos — see `lib/media.ts` for those URLs.
 */

export type RecipeMode = "vlm" | "yoloe";

export interface Recipe {
  name: string;
  description: string;
  mode: RecipeMode;
  vlm_query: string;
  yoloe_prompts: string[];
  exemplar_image_refs: string[];
  created_at: string;
  created_by: string;
  version: number;
}

export interface RecipeRow {
  name: string;
  description: string;
  status: string;
  created_at: string;
  recipe: Recipe;
  live: boolean;
}

export interface RuntimeInfo {
  video_url: string;
  agent_sse_url: string;
  mcp_url: string;
  dimos_status: "ready" | "down";
}

export interface AgentStatus {
  status: "ready" | "down" | "degraded";
  tool_count?: number;
  has_learned_skills?: boolean;
  error?: string;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = body?.detail ?? JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail ?? "(no body)"}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  getRuntime: () => request<RuntimeInfo>("/runtime"),
  getAgentStatus: () => request<AgentStatus>("/agents/status"),
  sendAgentMessage: (message: string) =>
    request<{ status: string; response: string }>("/agents/send", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  listRecipes: () => request<RecipeRow[]>("/recipes"),
  draftRecipe: (description: string, name_hint?: string) =>
    request<Recipe>("/recipes/draft", {
      method: "POST",
      body: JSON.stringify({ description, name_hint }),
    }),
  createRecipe: (recipe: Recipe) =>
    request<RecipeRow>("/recipes", {
      method: "POST",
      body: JSON.stringify(recipe),
    }),
  getRecipe: (name: string) => request<RecipeRow>(`/recipes/${name}`),
  deleteRecipe: (name: string) =>
    request<void>(`/recipes/${name}`, { method: "DELETE" }),
  invokeRecipe: (name: string) =>
    request<{ status: string; agent_response: string }>(
      `/recipes/${name}/invoke`,
      { method: "POST" },
    ),
};
