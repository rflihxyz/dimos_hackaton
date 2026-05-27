"use client";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type RecipeRow } from "@/lib/api";

export function RecipeList() {
  const [recipes, setRecipes] = useState<RecipeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invoking, setInvoking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.listRecipes().then(
        (data) => {
          if (cancelled) return;
          setError(null);
          setRecipes(data);
        },
        (err: Error) => {
          if (cancelled) return;
          setError(err.message);
          setRecipes([]);
        },
      );
    };
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const onInvoke = async (name: string) => {
    setInvoking(name);
    try {
      await api.invokeRecipe(name);
      toast.success(`Asked the agent to use "${name}"`);
    } catch (e) {
      toast.error(`Invoke failed: ${(e as Error).message}`);
    } finally {
      setInvoking(null);
    }
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-medium">Learned skills</CardTitle>
          <CardDescription>Recipes the robot can run on demand</CardDescription>
        </div>
        <Button asChild size="sm">
          <Link href="/skills/new">Teach a skill</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        <ScrollArea className="h-full">
          <div className="space-y-2 p-4 pt-0">
            {recipes === null && (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            )}
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {recipes !== null && recipes.length === 0 && !error && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No learned skills yet.
                <br />
                <Link href="/skills/new" className="text-foreground underline">
                  Teach the first one
                </Link>
                .
              </div>
            )}
            {recipes?.map((row) => (
              <RecipeItem
                key={row.name}
                row={row}
                onInvoke={onInvoke}
                invoking={invoking === row.name}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function RecipeItem({
  row,
  onInvoke,
  invoking,
}: {
  row: RecipeRow;
  onInvoke: (name: string) => void;
  invoking: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/skills/${row.name}`}
              className="truncate font-medium hover:underline"
            >
              {row.name}
            </Link>
            <Badge variant="outline" className="font-mono text-xs">
              {row.recipe.mode}
            </Badge>
            {row.live ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">live</Badge>
            ) : (
              <Badge variant="secondary">pending</Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {row.description}
          </p>
        </div>
        <Button
          size="sm"
          variant="default"
          onClick={() => onInvoke(row.name)}
          disabled={invoking}
        >
          {invoking ? "Sending…" : "Invoke"}
        </Button>
      </div>
    </div>
  );
}
