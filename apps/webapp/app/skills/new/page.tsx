"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api, type Recipe } from "@/lib/api";

export default function NewSkillPage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [shipping, setShipping] = useState(false);

  const onDraft = async () => {
    if (!description.trim() || drafting) return;
    setDrafting(true);
    setDraft(null);
    try {
      const recipe = await api.draftRecipe(description.trim());
      setDraft(recipe);
    } catch (e) {
      toast.error(`Draft failed: ${(e as Error).message}`);
    } finally {
      setDrafting(false);
    }
  };

  const onShip = async () => {
    if (!draft || shipping) return;
    setShipping(true);
    try {
      await api.createRecipe(draft);
      toast.success(`Shipped "${draft.name}"`);
      router.push("/");
    } catch (e) {
      toast.error(`Ship failed: ${(e as Error).message}`);
    } finally {
      setShipping(false);
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
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Teach a new skill
          </h1>
          <p className="text-sm text-muted-foreground">
            Describe what the robot should look out for. GPT-5.5 will
            synthesise a recipe; you confirm before shipping.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            1. Describe the skill
          </CardTitle>
          <CardDescription>
            Plain English — what should the robot detect or watch for?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Detect dangerous items on a construction site: exposed rebar, unsecured ladders, sharp tools."
            rows={4}
            disabled={drafting || shipping}
          />
          <div className="flex justify-end">
            <Button
              onClick={onDraft}
              disabled={!description.trim() || drafting || shipping}
            >
              {drafting ? "Drafting…" : "Draft recipe"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              2. Review the draft
            </CardTitle>
            <CardDescription>
              Mode: <code className="font-mono">{draft.mode}</code> · Name:{" "}
              <code className="font-mono">{draft.name}</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="overflow-auto rounded-md border bg-muted p-3 text-xs leading-relaxed">
              {JSON.stringify(draft, null, 2)}
            </pre>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDraft(null)}
                disabled={shipping}
              >
                Discard
              </Button>
              <Button onClick={onShip} disabled={shipping}>
                {shipping ? "Shipping…" : "Ship it"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
