"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { RolePermissionsEditor } from "@/components/role-permissions-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  api,
  type McpTool,
  type RoleRow,
  type Taxonomy,
} from "@/lib/api";

const SEED_ROLES = new Set(["admin", "operator", "guest"]);

export default function RoleEditPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const router = useRouter();

  const [role, setRole] = useState<RoleRow | null>(null);
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getRole(name),
      api.getTaxonomy(),
      api.listMcpTools(),
    ]).then(
      ([r, tax, cat]) => {
        if (cancelled) return;
        setRole(r);
        setPermissions(r.permissions);
        setTaxonomy(tax);
        setTools(cat.items);
      },
      (err: Error) => {
        if (cancelled) return;
        setLoadError(err.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [name]);

  const dirty =
    role !== null &&
    permissions !== null &&
    !permsEqual(role.permissions, permissions);

  const onSave = async () => {
    if (!permissions) return;
    setSaving(true);
    try {
      const updated = await api.updateRole(name, { permissions });
      setRole(updated);
      setPermissions(updated.permissions);
      toast.success(`Updated "${name}".`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    if (role) setPermissions(role.permissions);
  };

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href="/roles">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
              {SEED_ROLES.has(name) && (
                <Badge variant="outline" className="text-[10px]">
                  seed
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Toggle which MCP skills this role grants. Saving validates each
              entry against the live catalog.
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Allowed skills</CardTitle>
          <CardDescription>
            {role && tools
              ? `${
                  role.permissions.includes("*")
                    ? "wildcard granted"
                    : `${role.permissions.length} of ${tools.length} skills`
                } · last loaded ${new Date().toLocaleTimeString()}`
              : "Loading from broker + MCP catalog…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!loadError && (taxonomy === null || tools === null || permissions === null) && (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}
          {taxonomy && tools && permissions !== null && (
            <RolePermissionsEditor
              taxonomy={taxonomy}
              tools={tools}
              permissions={permissions}
              onChange={setPermissions}
              disabled={saving}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/roles")}
          disabled={saving}
        >
          Close
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          disabled={!dirty || saving}
        >
          Reset
        </Button>
        <Button type="button" onClick={onSave} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function permsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}
