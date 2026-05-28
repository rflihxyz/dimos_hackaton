"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { RolePermissionsEditor } from "@/components/role-permissions-editor";
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
import { Skeleton } from "@/components/ui/skeleton";
import { api, type McpTool, type Taxonomy } from "@/lib/api";

const NAME_RE = /^[a-z0-9_]{1,32}$/;

export default function NewRolePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getTaxonomy(), api.listMcpTools()]).then(
      ([tax, cat]) => {
        setTaxonomy(tax);
        setTools(cat.items);
      },
      (err: Error) => setLoadError(err.message),
    );
  }, []);

  const nameOk = NAME_RE.test(name);
  const canSubmit = nameOk && !submitting && taxonomy !== null && tools !== null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.createRole({ name, permissions });
      toast.success(`Created role "${name}".`);
      router.push("/roles");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href="/roles">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">New role</h1>
            <p className="text-muted-foreground">
              Pick a stable handle, then choose which skills the robot will run
              for users assigned to this role.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">1. Name</CardTitle>
            <CardDescription>
              Lowercase snake_case, immutable once created.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) =>
                  setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                }
                placeholder="researcher"
                disabled={submitting}
                aria-invalid={name.length > 0 && !nameOk}
              />
              {name.length > 0 && !nameOk && (
                <p className="text-xs text-destructive">
                  Lowercase snake_case, 1–32 chars: <code>[a-z0-9_]</code>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">2. Skills</CardTitle>
            <CardDescription>
              Sourced from the live MCP catalog. Use the wildcard to grant
              everything, or pick individual skills.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {loadError}
              </div>
            )}
            {!loadError && (taxonomy === null || tools === null) && (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}
            {taxonomy && tools && (
              <RolePermissionsEditor
                taxonomy={taxonomy}
                tools={tools}
                permissions={permissions}
                onChange={setPermissions}
                disabled={submitting}
              />
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/roles")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create role"}
          </Button>
        </div>
      </form>
    </div>
  );
}
