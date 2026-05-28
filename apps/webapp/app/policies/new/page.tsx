"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  emptyPolicyDraft,
  PolicyForm,
  validateDraft,
  type PolicyDraft,
} from "@/components/policy-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  api,
  type McpTool,
  type RoleRow,
  type SignalInfo,
  type Taxonomy,
} from "@/lib/api";

export default function NewPolicyPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<PolicyDraft>(emptyPolicyDraft);
  const [signals, setSignals] = useState<SignalInfo[] | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.listSignals(),
      api.getTaxonomy(),
      api.listMcpTools(),
      api.listRoles(),
    ]).then(
      ([sig, tax, cat, rls]) => {
        setSignals(sig.signals);
        setTaxonomy(tax);
        setTools(cat.items);
        setRoles(rls);
      },
      (err: Error) => setLoadError(err.message),
    );
  }, []);

  const validationError = validateDraft(draft, { isNew: true });
  const ready =
    signals !== null && taxonomy !== null && tools !== null && roles !== null;
  const canSubmit = ready && !submitting && validationError === null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.createPolicy({
        name: draft.name,
        description: draft.description.trim() || null,
        enabled: draft.enabled,
        scope_kind: draft.scope_kind,
        scope_values: draft.scope_values,
        applies_to_roles: draft.applies_to_roles,
        condition: draft.condition,
        message: draft.message.trim() || null,
      });
      toast.success(`Created policy "${draft.name}".`);
      router.push("/policies");
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
            <Link href="/policies">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">New policy</h1>
            <p className="text-muted-foreground">
              A deny rule that fires when its condition matches the live
              signals.
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {!ready && !loadError && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {ready && (
        <form onSubmit={onSubmit} className="space-y-6">
          <PolicyForm
            draft={draft}
            onChange={setDraft}
            disabled={submitting}
            isNew
            signals={signals!}
            taxonomy={taxonomy!}
            tools={tools!}
            roles={roles!}
          />

          <div className="flex items-center justify-end gap-3">
            {validationError && (
              <span className="text-xs text-muted-foreground">
                {validationError}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/policies")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "Creating…" : "Create policy"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
