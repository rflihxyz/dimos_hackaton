"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { api, type McpToolListResponse, type RoleRow } from "@/lib/api";

const WILDCARD = "*";
const SEED_ROLES = new Set(["admin", "operator", "guest"]);

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<McpToolListResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const reload = () => {
    api.listRoles().then(
      (data) => {
        setError(null);
        setRoles(data);
      },
      (err: Error) => {
        setError(err.message);
        setRoles([]);
      },
    );
    api.listMcpTools().then(
      (c) => setCatalog(c),
      () => setCatalog(null),
    );
  };

  useEffect(() => {
    reload();
  }, []);

  const onSync = async () => {
    setSyncing(true);
    try {
      const result = await api.syncMcpTools();
      if (result.skipped) {
        toast.warning("MCP returned no tools — keeping last known catalog.");
      } else {
        toast.success(
          `Synced: ${result.upserted} upserted, ${result.deleted} removed.`,
        );
      }
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const onDelete = async (name: string) => {
    if (
      !confirm(
        `Delete role "${name}"? Users referencing it will block the deletion.`,
      )
    ) {
      return;
    }
    setDeleting(name);
    try {
      await api.deleteRole(name);
      toast.success(`Deleted role "${name}".`);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Roles</h1>
            <p className="text-muted-foreground">
              Each role grants a set of MCP skills the robot may run for the
              users it&apos;s assigned to.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            disabled={syncing}
          >
            <RefreshCw
              className={"h-4 w-4" + (syncing ? " animate-spin" : "")}
            />
            Sync from MCP
          </Button>
          <Button asChild size="sm">
            <Link href="/roles/new">New role</Link>
          </Button>
        </div>
      </div>

      <CatalogStatusBanner catalog={catalog} />

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">All roles</CardTitle>
          <CardDescription>
            Click a role to view and edit its allowed skills.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {roles === null && (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          )}
          {roles?.length === 0 && !error && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No roles defined.
            </div>
          )}
          {roles?.map((r) => (
            <RoleRowItem
              key={r.name}
              role={r}
              catalog={catalog}
              onDelete={onDelete}
              deleting={deleting === r.name}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function CatalogStatusBanner({
  catalog,
}: {
  catalog: McpToolListResponse | null;
}) {
  if (!catalog) return null;
  if (catalog.total === 0) {
    return (
      <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
        <p className="font-medium">No skills in the catalog yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Start DimOS and click <em>Sync from MCP</em>. Until then you can only
          create roles with full-access (<code>*</code>) or empty permissions.
        </p>
      </div>
    );
  }
  const last = catalog.last_synced_at
    ? new Date(catalog.last_synced_at).toLocaleString()
    : "never";
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
      <span>
        {catalog.total} skill{catalog.total === 1 ? "" : "s"} in catalog • last
        synced {last}
      </span>
      {catalog.uncategorized_count > 0 && (
        <Badge variant="outline" className="text-[10px]">
          {catalog.uncategorized_count} uncategorized
        </Badge>
      )}
    </div>
  );
}

function RoleRowItem({
  role,
  catalog,
  onDelete,
  deleting,
}: {
  role: RoleRow;
  catalog: McpToolListResponse | null;
  onDelete: (name: string) => void;
  deleting: boolean;
}) {
  const isWildcard = role.permissions.includes(WILDCARD);
  const isSeed = SEED_ROLES.has(role.name);
  const totalKnown = catalog?.total ?? 0;
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{role.name}</span>
          {isSeed && (
            <Badge variant="outline" className="text-[10px]">
              seed
            </Badge>
          )}
          {isWildcard ? (
            <Badge className="bg-amber-600 hover:bg-amber-600 text-[10px]">
              full access
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              {role.permissions.length}
              {totalKnown > 0 ? ` / ${totalKnown}` : ""} skill
              {role.permissions.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        {role.permissions.length > 0 && !isWildcard && (
          <div className="mt-1 flex flex-wrap gap-1">
            {role.permissions.slice(0, 6).map((p) => (
              <code
                key={p}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
              >
                {p}
              </code>
            ))}
            {role.permissions.length > 6 && (
              <span className="text-[10px] text-muted-foreground">
                +{role.permissions.length - 6} more
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/roles/${role.name}`}>Edit</Link>
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onDelete(role.name)}
          disabled={deleting}
        >
          {deleting ? "…" : "Delete"}
        </Button>
      </div>
    </div>
  );
}
