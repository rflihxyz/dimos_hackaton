"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  PolicyForm,
  validateDraft,
  type PolicyDraft,
} from "@/components/policy-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  api,
  type McpTool,
  type PolicyRow,
  type RoleRow,
  type SignalInfo,
  type Taxonomy,
} from "@/lib/api";

export default function EditPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = use(params);
  const id = Number(idStr);
  const router = useRouter();

  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [original, setOriginal] = useState<PolicyRow | null>(null);
  const [signals, setSignals] = useState<SignalInfo[] | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Number.isNaN(id)) {
      setLoadError("Invalid policy id");
      return;
    }
    let cancelled = false;
    Promise.all([
      api.getPolicy(id),
      api.listSignals(),
      api.getTaxonomy(),
      api.listMcpTools(),
      api.listRoles(),
    ]).then(
      ([p, sig, tax, cat, rls]) => {
        if (cancelled) return;
        setOriginal(p);
        setDraft(policyToDraft(p));
        setSignals(sig.signals);
        setTaxonomy(tax);
        setTools(cat.items);
        setRoles(rls);
      },
      (err: Error) => {
        if (cancelled) return;
        setLoadError(err.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  const ready =
    draft !== null &&
    signals !== null &&
    taxonomy !== null &&
    tools !== null &&
    roles !== null;

  const validationError = draft ? validateDraft(draft, { isNew: false }) : null;
  const canSave = ready && !saving && validationError === null;

  const onSave = async () => {
    if (!draft || !canSave) return;
    setSaving(true);
    try {
      const updated = await api.updatePolicy(id, {
        description: draft.description.trim() || null,
        enabled: draft.enabled,
        scope_kind: draft.scope_kind,
        scope_values: draft.scope_values,
        applies_to_roles: draft.applies_to_roles,
        condition: draft.condition,
        message: draft.message.trim() || null,
      });
      setOriginal(updated);
      setDraft(policyToDraft(updated));
      toast.success(`Saved "${updated.name}".`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    if (original) setDraft(policyToDraft(original));
  };

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href="/policies">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {original?.name ?? "…"}
            </h1>
            <p className="text-muted-foreground">
              Edit this deny rule. Saving re-validates against the catalog.
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

      {ready && draft && (
        <>
          <PolicyForm
            draft={draft}
            onChange={setDraft}
            disabled={saving}
            isNew={false}
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
              disabled={saving}
            >
              Close
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={saving}
            >
              Reset
            </Button>
            <Button type="button" onClick={onSave} disabled={!canSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function policyToDraft(p: PolicyRow): PolicyDraft {
  return {
    name: p.name,
    description: p.description ?? "",
    enabled: p.enabled,
    scope_kind: p.scope_kind,
    scope_values: [...p.scope_values],
    applies_to_roles: [...p.applies_to_roles],
    condition: p.condition,
    message: p.message ?? "",
  };
}
