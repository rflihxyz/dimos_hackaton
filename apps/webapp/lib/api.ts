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

export interface AgentSendResponse {
  status: string;
  /** Synchronous acknowledgement string returned by dimos's `agent_send`. */
  ack: string;
  /**
   * One line per gated tool call the agent made during this turn. Lines
   * start with `allow`, `deny (rbac)`, or `deny (policy)`. Empty when
   * the agent didn't call any tools.
   */
  events: string[];
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
  email: string;
  password: string;
}

export interface UserPatch {
  full_name?: string;
  role?: string;
}

// ----- Policies -----

export type SignalKind = "number" | "bool" | "enum" | "string";
export type SignalSource = "sensor" | "vla_recipe" | "time" | "user_context";
export type PolicyOperator =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "in"
  | "not_in";
export type ScopeKind = "all" | "categories" | "skills";

export interface SignalInfo {
  name: string;
  kind: SignalKind;
  source: SignalSource;
  description: string;
  unit: string | null;
  enum_values: string[] | null;
  default_when_missing: unknown;
}

export interface SignalCatalogResponse {
  signals: SignalInfo[];
  operators: PolicyOperator[];
}

export interface Predicate {
  signal: string;
  op: PolicyOperator;
  value: unknown;
}

/** Top-level: exactly one of `all_of` / `any_of` is set. */
export interface Condition {
  all_of?: Predicate[];
  any_of?: Predicate[];
}

export interface PolicyRow {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  scope_kind: ScopeKind;
  scope_values: string[];
  applies_to_roles: string[];
  condition: Condition;
  message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyCreate {
  name: string;
  description?: string | null;
  enabled?: boolean;
  scope_kind: ScopeKind;
  scope_values: string[];
  applies_to_roles: string[];
  condition: Condition;
  message?: string | null;
}

export interface PolicyPatch {
  description?: string | null;
  enabled?: boolean;
  scope_kind?: ScopeKind;
  scope_values?: string[];
  applies_to_roles?: string[];
  condition?: Condition;
  message?: string | null;
}

export interface EvaluateRequest {
  skill: string;
  role?: string | null;
  signals: Record<string, unknown>;
}

export interface PolicyMatch {
  policy_id: number;
  policy_name: string;
  message: string | null;
}

export interface EvaluateResponse {
  decision: "allow" | "deny";
  matched: PolicyMatch[];
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ----- Auth types -----

export interface UserAuth {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserAuth;
}

export interface SignupRequest {
  email: string;
  password: string;
  full_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ----- Auth token storage (localStorage; SSR-safe) -----

const TOKEN_KEY = "auth_token";
const TOKEN_TYPE_KEY = "token_type";
const USER_KEY = "auth_user";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getAuthToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserAuth | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserAuth;
  } catch {
    return null;
  }
}

export function saveAuth(res: LoginResponse): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(TOKEN_KEY, res.access_token);
  window.localStorage.setItem(TOKEN_TYPE_KEY, res.token_type);
  window.localStorage.setItem(USER_KEY, JSON.stringify(res.user));
}

export function clearAuth(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_TYPE_KEY);
  window.localStorage.removeItem(USER_KEY);
}

/** Thrown on non-2xx responses; carries the raw status + parsed detail. */
export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, statusText: string, detail: unknown) {
    super(
      typeof detail === "string"
        ? `${status} ${statusText}: ${detail}`
        : `${status} ${statusText}`,
    );
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    let parsed: unknown;
    let detailStr: string | undefined;
    try {
      parsed = await res.json();
      const d = (parsed as { detail?: unknown })?.detail;
      detailStr = typeof d === "string" ? d : JSON.stringify(parsed);
    } catch {
      detailStr = await res.text();
      parsed = detailStr;
    }

    // A 401 from anywhere means our token is stale; nuke it so the
    // AuthProvider can redirect to /login on the next render.
    if (res.status === 401) {
      clearAuth();
    }

    throw new ApiError(res.status, res.statusText, parsed ?? detailStr);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  signup: (body: SignupRequest) =>
    request<UserAuth>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: LoginRequest) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<UserAuth>("/auth/me"),

  getRuntime: () => request<RuntimeInfo>("/runtime"),
  getAgentStatus: () => request<AgentStatus>("/agents/status"),
  sendAgentMessage: (message: string) =>
    request<AgentSendResponse>("/agents/send", {
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

  listSignals: () => request<SignalCatalogResponse>("/policies/signals"),
  listPolicies: () => request<PolicyRow[]>("/policies"),
  getPolicy: (id: number) => request<PolicyRow>(`/policies/${id}`),
  createPolicy: (body: PolicyCreate) =>
    request<PolicyRow>("/policies", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePolicy: (id: number, patch: PolicyPatch) =>
    request<PolicyRow>(`/policies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deletePolicy: (id: number) =>
    request<void>(`/policies/${id}`, { method: "DELETE" }),
  evaluatePolicies: (body: EvaluateRequest) =>
    request<EvaluateResponse>("/policies/evaluate", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /**
   * Multipart upload — must NOT set Content-Type manually so the browser
   * adds the multipart boundary.
   */
  uploadUserFace: async (username: string, blob: Blob): Promise<UserRow> => {
    const form = new FormData();
    const filename = blob.type === "image/png" ? "face.png" : "face.jpg";
    form.append("file", blob, filename);
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/users/${username}/face`, {
      method: "POST",
      body: form,
      cache: "no-store",
      headers,
    });
    if (!res.ok) {
      if (res.status === 401) clearAuth();
      let parsed: unknown;
      let detailStr: string | undefined;
      try {
        parsed = await res.json();
        const d = (parsed as { detail?: unknown })?.detail;
        detailStr = typeof d === "string" ? d : JSON.stringify(parsed);
      } catch {
        detailStr = await res.text();
        parsed = detailStr;
      }
      throw new ApiError(res.status, res.statusText, parsed ?? detailStr);
    }
    return res.json() as Promise<UserRow>;
  },

  faceImageUrl: (username: string) =>
    `${API_BASE}/users/${username}/face?ts=${Date.now()}`,
};
