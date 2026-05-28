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

/**
 * The fixed set of action categories used to *group* skills in the UI.
 * Mirrors `ActionCategory` in `packages/api/src/rbac/taxonomy.py` —
 * note that categories are no longer valid permission tokens themselves;
 * permissions are MCP skill names (or `"*"`).
 */
export type ActionCategory = "observe" | "watch" | "move" | "speak";

/**
 * One entry from `GET /rbac/taxonomy`.
 */
export interface CategoryInfo {
  name: ActionCategory;
  label: string;
  description: string;
  examples: string[];
  skills: string[];
}

export interface Taxonomy {
  wildcard: string;
  categories: CategoryInfo[];
  always_allowed_skills: string[];
}

export interface RoleRow {
  name: string;
  /** MCP skill names (sourced from `mcp_tools`), or `["*"]` for full access. */
  permissions: string[];
}

export interface RoleCreate {
  name: string;
  permissions: string[];
}

export interface RolePatch {
  permissions: string[];
}

export interface McpTool {
  name: string;
  description: string | null;
  input_schema: Record<string, unknown> | null;
  first_seen_at: string;
  last_seen_at: string;
  category: ActionCategory | null;
  is_always_allowed: boolean;
  is_categorized: boolean;
}

export interface McpToolListResponse {
  items: McpTool[];
  total: number;
  last_synced_at: string | null;
  uncategorized_count: number;
}

export interface McpSyncResponse {
  upserted: number;
  deleted: number;
  last_synced_at: string;
  skipped: boolean;
}

export interface UserRow {
  username: string;
  full_name: string;
  role: string;
  has_face_image: boolean;
  has_face_embedding: boolean;
  created_at: string;
}

export interface UserCreate {
  username: string;
  full_name: string;
  role: string;
}

export interface UserPatch {
  full_name?: string;
  role?: string;
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

  getTaxonomy: () => request<Taxonomy>("/rbac/taxonomy"),

  listMcpTools: () => request<McpToolListResponse>("/mcp/tools"),
  syncMcpTools: () =>
    request<McpSyncResponse>("/mcp/tools/sync", { method: "POST" }),

  listRoles: () => request<RoleRow[]>("/roles"),
  getRole: (name: string) => request<RoleRow>(`/roles/${name}`),
  createRole: (body: RoleCreate) =>
    request<RoleRow>("/roles", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateRole: (name: string, patch: RolePatch) =>
    request<RoleRow>(`/roles/${name}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteRole: (name: string) =>
    request<void>(`/roles/${name}`, { method: "DELETE" }),

  listUsers: () => request<UserRow[]>("/users"),
  getUser: (username: string) => request<UserRow>(`/users/${username}`),
  createUser: (body: UserCreate) =>
    request<UserRow>("/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateUser: (username: string, patch: UserPatch) =>
    request<UserRow>(`/users/${username}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteUser: (username: string) =>
    request<void>(`/users/${username}`, { method: "DELETE" }),

  /**
   * Multipart upload — must NOT set Content-Type manually so the browser
   * adds the multipart boundary.
   */
  uploadUserFace: async (username: string, blob: Blob): Promise<UserRow> => {
    const form = new FormData();
    const filename = blob.type === "image/png" ? "face.png" : "face.jpg";
    form.append("file", blob, filename);
    const res = await fetch(`${API_BASE}/users/${username}/face`, {
      method: "POST",
      body: form,
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
    return res.json() as Promise<UserRow>;
  },

  faceImageUrl: (username: string) =>
    `${API_BASE}/users/${username}/face?ts=${Date.now()}`,
};
