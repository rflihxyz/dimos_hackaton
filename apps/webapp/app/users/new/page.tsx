"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FaceCapture } from "@/components/face-capture";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  api,
  type McpTool,
  type RoleRow,
  type Taxonomy,
} from "@/lib/api";

const USERNAME_RE = /^[a-z0-9_]{1,32}$/;

export default function NewUserPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [tools, setTools] = useState<McpTool[] | null>(null);

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("");
  const [face, setFace] = useState<Blob | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listRoles().then(
      (data) => {
        setRoles(data);
        if (data.length > 0 && !role) {
          // Default to "guest" if it exists, else first.
          const guest = data.find((r) => r.name === "guest");
          setRole((guest ?? data[0]).name);
        }
      },
      (err: Error) => setRolesError(err.message),
    );
    api.getTaxonomy().then(
      (t) => setTaxonomy(t),
      // Non-fatal: the form still works without the taxonomy, we just
      // render raw permission strings as a fallback.
      () => setTaxonomy(null),
    );
    api.listMcpTools().then(
      (cat) => setTools(cat.items),
      () => setTools([]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRole = roles?.find((r) => r.name === role) ?? null;

  const usernameOk = USERNAME_RE.test(username);
  const formOk =
    usernameOk && fullName.trim().length > 0 && role && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOk) return;

    setSubmitting(true);
    try {
      await api.createUser({
        username,
        full_name: fullName.trim(),
        role,
      });

      if (face) {
        try {
          await api.uploadUserFace(username, face);
        } catch (e) {
          // User exists but face upload failed — surface but don't roll back.
          toast.error(
            `User created, but face upload failed: ${(e as Error).message}`,
          );
          router.push("/");
          return;
        }
      }

      toast.success(`Added ${username}`);
      router.push("/");
    } catch (e) {
      toast.error(`Create failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Add a person</h1>
            <p className="text-muted-foreground">
              Identity comes from the camera, so a clear face shot matters.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">1. Identity</CardTitle>
            <CardDescription>
              Username is the stable handle the robot uses internally.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                }
                placeholder="alice_smith"
                disabled={submitting}
                aria-invalid={username.length > 0 && !usernameOk}
              />
              {username.length > 0 && !usernameOk && (
                <p className="text-xs text-destructive">
                  Lowercase snake_case, 1–32 chars: <code>[a-z0-9_]</code>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Alice Smith"
                disabled={submitting}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">2. Authorisations</CardTitle>
            <CardDescription>
              The role determines which skills the robot will run for this person.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rolesError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {rolesError}
              </div>
            )}
            {!roles && !rolesError && (
              <p className="text-sm text-muted-foreground">Loading roles…</p>
            )}
            {roles && (
              <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={submitting}
                  className="block h-8 w-full rounded-lg border bg-background px-2.5 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
                >
                  {roles.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedRole && (
              <RolePermissionsPreview
                role={selectedRole}
                taxonomy={taxonomy}
                tools={tools}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">3. Face</CardTitle>
            <CardDescription>
              Optional — you can add it later. Without it the robot can&apos;t
              recognise this person and falls back to the guest role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FaceCapture onChange={setFace} disabled={submitting} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!formOk}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

const WILDCARD = "*";

function RolePermissionsPreview({
  role,
  taxonomy,
  tools,
}: {
  role: RoleRow;
  taxonomy: Taxonomy | null;
  tools: McpTool[] | null;
}) {
  const isWildcard = role.permissions.includes(WILDCARD);
  const grantedSet = new Set(role.permissions);

  // No taxonomy or catalog available yet → render raw permission strings
  // so the operator at least sees what the role grants.
  if (!taxonomy) {
    return (
      <div className="rounded-md border bg-muted/50 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Permissions granted by <code>{role.name}</code>
        </p>
        {role.permissions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None. The robot will refuse every request.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {role.permissions.map((p) => (
              <code
                key={p}
                className="rounded bg-background px-1.5 py-0.5 text-xs"
              >
                {p}
              </code>
            ))}
          </div>
        )}
      </div>
    );
  }

  // With the taxonomy, group the granted skill names by category. We
  // match by skill name in mcp_tools (when available) and fall back to
  // the static SKILL_TO_CATEGORY mapping the taxonomy ships with.
  const categoryFor = (skill: string): string => {
    const fromCatalog = tools?.find((t) => t.name === skill)?.category ?? null;
    if (fromCatalog) return fromCatalog;
    const fromTaxonomy = taxonomy.categories.find((c) =>
      c.skills.includes(skill),
    );
    return fromTaxonomy?.name ?? "_uncategorized";
  };

  const grantedSkills = isWildcard
    ? // Wildcard → effectively grants everything in the catalog.
      (tools ?? []).map((t) => t.name)
    : Array.from(grantedSet).filter((p) => p !== WILDCARD);

  const buckets = new Map<string, string[]>();
  for (const c of taxonomy.categories) buckets.set(c.name, []);
  buckets.set("_uncategorized", []);
  for (const s of grantedSkills) {
    const key = categoryFor(s);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(s);
  }

  const populatedCategories: { label: string; skills: string[] }[] = [];
  for (const c of taxonomy.categories) {
    const skills = buckets.get(c.name) ?? [];
    if (skills.length > 0) populatedCategories.push({ label: c.label, skills });
  }
  const uncategorized = buckets.get("_uncategorized") ?? [];
  if (uncategorized.length > 0) {
    populatedCategories.push({ label: "Other", skills: uncategorized });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            What <code>{role.name}</code> can ask the robot to do
          </p>
          {isWildcard && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              full access
            </span>
          )}
        </div>
        {grantedSkills.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing. The robot will refuse every command from this person.
          </p>
        ) : (
          <ul className="space-y-2">
            {populatedCategories.map((c) => (
              <CategoryGrantRow
                key={c.label}
                label={c.label}
                skills={c.skills}
              />
            ))}
          </ul>
        )}
      </div>

      {taxonomy.always_allowed_skills.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Utility skills always available:{" "}
          {taxonomy.always_allowed_skills.map((s, i) => (
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

function CategoryGrantRow({
  label,
  skills,
}: {
  label: string;
  skills: string[];
}) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
        />
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          ({skills.length} skill{skills.length === 1 ? "" : "s"})
        </span>
      </div>
      <div className="ml-4 flex flex-wrap gap-1">
        {skills.map((s) => (
          <code key={s} className="rounded bg-background px-1.5 py-0.5 text-[10px]">
            {s}
          </code>
        ))}
      </div>
    </li>
  );
}
