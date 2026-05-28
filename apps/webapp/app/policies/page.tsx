"use client";

import { ArrowLeft } from "lucide-react";
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
import { api, type PolicyRow } from "@/lib/api";

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<PolicyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const reload = () => {
    api.listPolicies().then(
      (data) => {
        setError(null);
        setPolicies(data);
      },
      (err: Error) => {
        setError(err.message);
        setPolicies([]);
      },
    );
  };

  useEffect(() => {
    reload();
  }, []);

  const onToggle = async (p: PolicyRow) => {
    setBusy(p.id);
    try {
      await api.updatePolicy(p.id, { enabled: !p.enabled });
      toast.success(`${p.enabled ? "Disabled" : "Enabled"} "${p.name}".`);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async (p: PolicyRow) => {
    if (!confirm(`Delete policy "${p.name}"?`)) return;
    setBusy(p.id);
    try {
      await api.deletePolicy(p.id);
      toast.success(`Deleted "${p.name}".`);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
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
            <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
            <p className="text-muted-foreground">
              Contextual deny rules. Evaluated after the role check; any
              matching policy blocks the call.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href="/policies/new">New policy</Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">All policies</CardTitle>
          <CardDescription>
            Each rule looks at the live signal snapshot. Disabled rules stay in
            the list but stop denying.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {policies === null && (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          )}
          {policies?.length === 0 && !error && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No policies defined yet. Create one to start gating actions on
              live context (temperature, kids in view, battery, …).
            </div>
          )}
          {policies?.map((p) => (
            <PolicyListItem
              key={p.id}
              policy={p}
              busy={busy === p.id}
              onToggle={() => onToggle(p)}
              onDelete={() => onDelete(p)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PolicyListItem({
  policy,
  busy,
  onToggle,
  onDelete,
}: {
  policy: PolicyRow;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const terms = policy.condition.all_of ?? policy.condition.any_of ?? [];
  const mode = policy.condition.all_of ? "ALL" : "ANY";

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{policy.name}</span>
          {policy.enabled ? (
            <Badge variant="secondary" className="text-[10px]">
              enabled
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              disabled
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {policy.scope_kind === "all"
              ? "all actions"
              : `${policy.scope_kind}: ${policy.scope_values.join(", ")}`}
          </Badge>
          {policy.applies_to_roles.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              roles: {policy.applies_to_roles.join(", ")}
            </Badge>
          )}
        </div>
        {policy.description && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {policy.description}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <span className="uppercase tracking-wide">{mode}</span>
          {terms.map((t, i) => (
            <code key={i} className="rounded bg-muted px-1.5 py-0.5">
              {t.signal} {t.op}{" "}
              {Array.isArray(t.value) ? `[${t.value.join(", ")}]` : String(t.value)}
            </code>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/policies/${policy.id}`}>Edit</Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onToggle}
          disabled={busy}
        >
          {policy.enabled ? "Disable" : "Enable"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={onDelete}
          disabled={busy}
        >
          {busy ? "…" : "Delete"}
        </Button>
      </div>
    </div>
  );
}
