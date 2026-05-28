"use client";

import { useMemo } from "react";

import { PolicyConditionEditor } from "@/components/policy-condition-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type Condition,
  type McpTool,
  type RoleRow,
  type ScopeKind,
  type SignalInfo,
  type Taxonomy,
} from "@/lib/api";

const NAME_RE = /^[a-z0-9_]{1,64}$/;

export interface PolicyDraft {
  name: string;
  description: string;
  enabled: boolean;
  scope_kind: ScopeKind;
  scope_values: string[];
  applies_to_roles: string[];
  condition: Condition;
  message: string;
}

export function emptyPolicyDraft(): PolicyDraft {
  return {
    name: "",
    description: "",
    enabled: true,
    scope_kind: "categories",
    scope_values: ["move"],
    applies_to_roles: [],
    condition: { all_of: [] },
    message: "",
  };
}

/**
 * Decide whether the draft is well-formed enough to submit. Mirrors
 * the server-side validation so the Save button only enables when the
 * payload should pass.
 */
export function validateDraft(
  draft: PolicyDraft,
  opts: { isNew: boolean },
): string | null {
  if (opts.isNew && !NAME_RE.test(draft.name)) {
    return "Name must be lowercase snake_case (1–64 chars).";
  }
  if (draft.scope_kind !== "all" && draft.scope_values.length === 0) {
    return `Pick at least one ${
      draft.scope_kind === "skills" ? "skill" : "category"
    } to gate.`;
  }
  const terms = draft.condition.all_of ?? draft.condition.any_of ?? [];
  if (terms.length === 0) {
    return "Add at least one predicate to the condition.";
  }
  return null;
}

interface Props {
  draft: PolicyDraft;
  onChange: (next: PolicyDraft) => void;
  disabled?: boolean;
  isNew: boolean;
  signals: SignalInfo[];
  taxonomy: Taxonomy;
  tools: McpTool[];
  roles: RoleRow[];
}

/**
 * Full policy form (everything except the page-level header + submit
 * buttons). Shared between the new and edit pages.
 */
export function PolicyForm({
  draft,
  onChange,
  disabled,
  isNew,
  signals,
  taxonomy,
  tools,
  roles,
}: Props) {
  const skillsByCategory = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of taxonomy.categories) m.set(c.name, []);
    for (const t of tools) {
      if (t.is_always_allowed || !t.category) continue;
      m.get(t.category)?.push(t.name);
    }
    return m;
  }, [taxonomy.categories, tools]);

  const update = (patch: Partial<PolicyDraft>) => onChange({ ...draft, ...patch });

  const toggleScopeValue = (value: string) => {
    const set = new Set(draft.scope_values);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    update({ scope_values: Array.from(set) });
  };

  const toggleRole = (name: string) => {
    const set = new Set(draft.applies_to_roles);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    update({ applies_to_roles: Array.from(set) });
  };

  const onScopeKindChange = (kind: ScopeKind) => {
    if (kind === "all") {
      update({ scope_kind: kind, scope_values: [] });
      return;
    }
    if (kind === draft.scope_kind) return;
    // Reset values when switching between categories / skills since
    // the value namespace changes.
    update({ scope_kind: kind, scope_values: [] });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">1. Identity</CardTitle>
          <CardDescription>
            A stable handle and a one-line description for operators reading
            the list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={draft.name}
              onChange={(e) =>
                update({
                  name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                })
              }
              placeholder="no_move_when_kids_in_view"
              disabled={disabled || !isNew}
              aria-invalid={isNew && draft.name.length > 0 && !NAME_RE.test(draft.name)}
            />
            {isNew && draft.name.length > 0 && !NAME_RE.test(draft.name) && (
              <p className="text-xs text-destructive">
                Lowercase snake_case, 1–64 chars: <code>[a-z0-9_]</code>
              </p>
            )}
            {!isNew && (
              <p className="text-xs text-muted-foreground">
                Names are immutable once a policy is created.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Block locomotion while a child is in the room."
              disabled={disabled}
              rows={2}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={disabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="h-4 w-4 accent-foreground"
            />
            Enabled
            <span className="text-xs text-muted-foreground">
              · disabled policies stay in the list but don&apos;t deny anything
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">2. What it gates</CardTitle>
          <CardDescription>
            Pick the actions this policy can deny when its condition is true.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {(["all", "categories", "skills"] as ScopeKind[]).map((k) => (
              <button
                type="button"
                key={k}
                disabled={disabled}
                onClick={() => onScopeKindChange(k)}
                className={
                  "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                  (draft.scope_kind === k
                    ? "border-foreground bg-foreground text-background"
                    : "bg-card hover:bg-muted/50")
                }
              >
                {k === "all" ? "Everything" : k === "categories" ? "By category" : "By skill"}
              </button>
            ))}
          </div>

          {draft.scope_kind === "categories" && (
            <div className="space-y-2">
              {taxonomy.categories.map((c) => {
                const checked = draft.scope_values.includes(c.name);
                const skills = skillsByCategory.get(c.name) ?? [];
                return (
                  <label
                    key={c.name}
                    className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleScopeValue(c.name)}
                      className="mt-0.5 h-4 w-4 accent-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.label}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {c.name}
                        </code>
                        <span className="text-[10px] text-muted-foreground">
                          {skills.length} skill{skills.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {draft.scope_kind === "skills" && (
            <div className="space-y-3">
              {taxonomy.categories.map((c) => {
                const skills = skillsByCategory.get(c.name) ?? [];
                if (skills.length === 0) return null;
                return (
                  <div key={c.name} className="rounded-md border bg-card p-3">
                    <div className="mb-2 text-sm font-medium">{c.label}</div>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {skills.map((s) => {
                        const checked = draft.scope_values.includes(s);
                        return (
                          <label
                            key={s}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleScopeValue(s)}
                              className="h-4 w-4 accent-foreground"
                            />
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {s}
                            </code>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {tools.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  MCP catalog is empty. Sync it from the Roles page first.
                </p>
              )}
            </div>
          )}

          {draft.scope_kind === "all" && (
            <p className="text-xs text-muted-foreground">
              The policy will be considered for every tool call. Use this when
              the rule is a hard safety guard (e.g. low battery).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">3. Who it applies to</CardTitle>
          <CardDescription>
            Leave empty to apply to every role. Otherwise the policy only
            fires for users in one of the selected roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <p className="text-xs text-muted-foreground">No roles defined yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => {
                const checked = draft.applies_to_roles.includes(r.name);
                return (
                  <button
                    type="button"
                    key={r.name}
                    disabled={disabled}
                    onClick={() => toggleRole(r.name)}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition-colors " +
                      (checked
                        ? "border-foreground bg-foreground text-background"
                        : "bg-card hover:bg-muted/50")
                    }
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          )}
          {draft.applies_to_roles.length === 0 && roles.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              No role selected · applies to <strong>everyone</strong>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">4. Condition</CardTitle>
          <CardDescription>
            The policy fires only when the condition evaluates to true against
            the current signal readings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {signals.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No signals registered.
            </p>
          ) : (
            <PolicyConditionEditor
              condition={draft.condition}
              signals={signals}
              onChange={(condition) => update({ condition })}
              disabled={disabled}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">5. Deny message</CardTitle>
          <CardDescription>
            Optional. Surfaced to the user / agent when this policy blocks a
            call. Keep it short.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={draft.message}
            onChange={(e) => update({ message: e.target.value })}
            placeholder="It's too hot to move safely right now."
            disabled={disabled}
            rows={2}
          />
        </CardContent>
      </Card>
    </div>
  );
}
