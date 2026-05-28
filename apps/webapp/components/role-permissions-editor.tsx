"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type ActionCategory,
  type CategoryInfo,
  type McpTool,
  type Taxonomy,
} from "@/lib/api";

const WILDCARD = "*";

interface Props {
  permissions: string[];
  onChange: (next: string[]) => void;
  taxonomy: Taxonomy;
  tools: McpTool[];
  disabled?: boolean;
}

/**
 * Toggleable picker for a role's permissions, sourced from the live MCP
 * catalog. Skills are grouped by their category from the taxonomy; the
 * wildcard (`*`) sits at the top as an exclusive "grant everything" toggle.
 *
 * Held state is the canonical permissions array; emit on every change.
 */
export function RolePermissionsEditor({
  permissions,
  onChange,
  taxonomy,
  tools,
  disabled,
}: Props) {
  const isWildcard = permissions.includes(WILDCARD);
  const granted = useMemo(() => new Set(permissions), [permissions]);

  const toolsByName = useMemo(() => {
    const m = new Map<string, McpTool>();
    for (const t of tools) m.set(t.name, t);
    return m;
  }, [tools]);

  // Group tools: each category from the taxonomy + an "Uncategorized" bucket.
  const grouped = useMemo(() => {
    const buckets = new Map<ActionCategory | "_uncategorized", McpTool[]>();
    for (const c of taxonomy.categories) buckets.set(c.name, []);
    buckets.set("_uncategorized", []);
    for (const t of tools) {
      if (t.is_always_allowed) continue;
      const key: ActionCategory | "_uncategorized" =
        (t.category as ActionCategory | null) ?? "_uncategorized";
      buckets.get(key)?.push(t);
    }
    for (const list of buckets.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return buckets;
  }, [tools, taxonomy.categories]);

  const alwaysAllowedPresent = useMemo(
    () => taxonomy.always_allowed_skills.filter((s) => toolsByName.has(s)),
    [taxonomy.always_allowed_skills, toolsByName],
  );

  const setWildcard = (on: boolean) => {
    onChange(on ? [WILDCARD] : []);
  };

  const toggleSkill = (name: string) => {
    if (isWildcard) {
      // Switching from wildcard → start with just this skill granted.
      onChange([name]);
      return;
    }
    if (granted.has(name)) {
      onChange(permissions.filter((p) => p !== name));
    } else {
      onChange([...permissions, name]);
    }
  };

  const grantCategory = (skills: McpTool[]) => {
    if (isWildcard) return;
    const next = new Set(permissions);
    for (const t of skills) next.add(t.name);
    onChange(Array.from(next));
  };

  const revokeCategory = (skills: McpTool[]) => {
    if (isWildcard) return;
    const remove = new Set(skills.map((t) => t.name));
    onChange(permissions.filter((p) => !remove.has(p)));
  };

  return (
    <div className="space-y-4">
      <WildcardRow
        on={isWildcard}
        disabled={disabled}
        onToggle={setWildcard}
      />

      {tools.length === 0 ? (
        <EmptyCatalogNotice />
      ) : (
        <>
          {taxonomy.categories.map((c) => (
            <CategorySection
              key={c.name}
              category={c}
              tools={grouped.get(c.name) ?? []}
              granted={granted}
              wildcardActive={isWildcard}
              disabled={disabled}
              onToggleSkill={toggleSkill}
              onGrantAll={() => grantCategory(grouped.get(c.name) ?? [])}
              onRevokeAll={() => revokeCategory(grouped.get(c.name) ?? [])}
            />
          ))}

          {(grouped.get("_uncategorized") ?? []).length > 0 && (
            <CategorySection
              category={UNCATEGORIZED}
              tools={grouped.get("_uncategorized") ?? []}
              granted={granted}
              wildcardActive={isWildcard}
              disabled={disabled}
              onToggleSkill={toggleSkill}
              onGrantAll={() => grantCategory(grouped.get("_uncategorized") ?? [])}
              onRevokeAll={() => revokeCategory(grouped.get("_uncategorized") ?? [])}
            />
          )}
        </>
      )}

      {alwaysAllowedPresent.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Always available regardless of role:{" "}
          {alwaysAllowedPresent.map((s, i) => (
            <span key={s}>
              {i > 0 && ", "}
              <code className="rounded bg-muted px-1 py-0.5">{s}</code>
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}

const UNCATEGORIZED: CategoryInfo = {
  // Cast: this is a synthetic category used only for grouping in the UI.
  name: "_uncategorized" as unknown as ActionCategory,
  label: "Uncategorized",
  description:
    "Skills the broker doesn't recognise from src/rbac/taxonomy.py. Extend the SKILL_TO_CATEGORY map to move them out of here.",
  examples: [],
  skills: [],
};

function WildcardRow({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <label
      className={
        "flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors " +
        (on
          ? "border-amber-500/60 bg-amber-500/10"
          : "bg-card hover:bg-muted/50")
      }
    >
      <div>
        <div className="text-sm font-medium">Full access (wildcard)</div>
        <div className="text-xs text-muted-foreground">
          Grant every current and future skill. Overrides per-skill toggles.
        </div>
      </div>
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-4 w-4 accent-amber-600"
      />
    </label>
  );
}

function CategorySection({
  category,
  tools,
  granted,
  wildcardActive,
  disabled,
  onToggleSkill,
  onGrantAll,
  onRevokeAll,
}: {
  category: CategoryInfo;
  tools: McpTool[];
  granted: Set<string>;
  wildcardActive: boolean;
  disabled?: boolean;
  onToggleSkill: (name: string) => void;
  onGrantAll: () => void;
  onRevokeAll: () => void;
}) {
  if (tools.length === 0) return null;

  const grantedHere = tools.filter((t) => granted.has(t.name)).length;
  const total = tools.length;

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{category.label}</h3>
            <Badge variant="secondary" className="text-[10px]">
              {wildcardActive ? `${total}/${total}` : `${grantedHere}/${total}`}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {category.description}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || wildcardActive || grantedHere === total}
            onClick={onGrantAll}
          >
            Grant all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || wildcardActive || grantedHere === 0}
            onClick={onRevokeAll}
          >
            Revoke all
          </Button>
        </div>
      </div>
      <ul className="divide-y">
        {tools.map((t) => {
          const isGranted = wildcardActive || granted.has(t.name);
          return (
            <li key={t.name}>
              <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={isGranted}
                  disabled={disabled}
                  onChange={() => onToggleSkill(t.name)}
                  className="mt-0.5 h-4 w-4 accent-foreground"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                      {t.name}
                    </code>
                    {wildcardActive && (
                      <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        via *
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyCatalogNotice() {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm">
      <p className="font-medium">MCP catalog is empty.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Start DimOS on the host (
        <code>uv --project packages/dimos run dimos --simulation run unitree-go2-agentic</code>
        ), then click <em>Sync from MCP</em> on the roles page to populate the
        skill list.
      </p>
    </div>
  );
}
