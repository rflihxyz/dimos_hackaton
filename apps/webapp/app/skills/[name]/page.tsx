"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type RecipeRow } from "@/lib/api";

export default function SkillDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<RecipeRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"invoke" | "delete" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getRecipe(name).then(
      (data) => {
        if (cancelled) return;
        setError(null);
        setRow(data);
      },
      (err: Error) => {
        if (cancelled) return;
        setError(err.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [name]);

  const onInvoke = async () => {
    setBusy("invoke");
    try {
      await api.invokeRecipe(name);
      toast.success(`Asked the agent to use "${name}"`);
    } catch (e) {
      toast.error(`Invoke failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    setBusy("delete");
    try {
      await api.deleteRecipe(name);
      toast.success(`Deleted "${name}"`);
      router.push("/");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {name}
          </h1>
          {row && (
            <p className="text-sm text-muted-foreground">{row.description}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {row === null && !error && <Skeleton className="h-48 w-full" />}

      {row && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-medium">Recipe</CardTitle>
              <Badge variant="outline" className="font-mono text-xs">
                {row.recipe.mode}
              </Badge>
              {row.live ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">
                  live in dimos
                </Badge>
              ) : (
                <Badge variant="secondary">pending</Badge>
              )}
            </div>
            <CardDescription>
              Created {new Date(row.created_at).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="overflow-auto rounded-md border bg-muted p-3 text-xs leading-relaxed">
              {JSON.stringify(row.recipe, null, 2)}
            </pre>
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" disabled={busy !== null}>
                    Delete
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete recipe?</DialogTitle>
                    <DialogDescription>
                      This removes <code className="font-mono">{name}</code>{" "}
                      from the database and the shared recipes volume. The
                      next call to <code>list_learned_skills</code> won&apos;t
                      include it.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmOpen(false)}
                      disabled={busy === "delete"}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={onDelete}
                      disabled={busy === "delete"}
                    >
                      {busy === "delete" ? "Deleting…" : "Delete"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button onClick={onInvoke} disabled={busy !== null}>
                {busy === "invoke" ? "Sending…" : "Invoke now"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
