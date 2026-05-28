"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Condition,
  type Predicate,
  type PolicyOperator,
  type SignalInfo,
} from "@/lib/api";

const NUMBER_OPS: PolicyOperator[] = ["==", "!=", "<", "<=", ">", ">=", "in", "not_in"];
const NON_NUMBER_OPS: PolicyOperator[] = ["==", "!=", "in", "not_in"];

interface Props {
  condition: Condition;
  signals: SignalInfo[];
  onChange: (next: Condition) => void;
  disabled?: boolean;
}

/**
 * Controlled editor for a flat single-level condition AST.
 *
 * Owns no state of its own; emits a new {@link Condition} on every
 * change. Always normalises to either `all_of` or `any_of` so callers
 * never see a half-built shape.
 */
export function PolicyConditionEditor({
  condition,
  signals,
  onChange,
  disabled,
}: Props) {
  const mode: "all_of" | "any_of" = condition.any_of ? "any_of" : "all_of";
  const predicates: Predicate[] = useMemo(
    () => condition[mode] ?? [],
    [condition, mode],
  );

  const signalsByName = useMemo(() => {
    const m = new Map<string, SignalInfo>();
    for (const s of signals) m.set(s.name, s);
    return m;
  }, [signals]);

  const emit = (next: Predicate[]) => {
    onChange(mode === "all_of" ? { all_of: next } : { any_of: next });
  };

  const setMode = (m: "all_of" | "any_of") => {
    onChange(m === "all_of" ? { all_of: predicates } : { any_of: predicates });
  };

  const addPredicate = () => {
    const first = signals[0];
    if (!first) return;
    const next: Predicate = {
      signal: first.name,
      op: "==",
      value: defaultValueFor(first),
    };
    emit([...predicates, next]);
  };

  const updatePredicate = (idx: number, patch: Partial<Predicate>) => {
    const next = predicates.map((p, i) => {
      if (i !== idx) return p;
      const merged = { ...p, ...patch };
      // If the signal changed, reset op + value to safe defaults for
      // the new signal's kind.
      if (patch.signal && patch.signal !== p.signal) {
        const sig = signalsByName.get(patch.signal);
        if (sig) {
          merged.op = "==";
          merged.value = defaultValueFor(sig);
        }
      }
      // If the operator changed in a way that needs a list vs scalar
      // (or vice versa), reshape the value to avoid invalid submits.
      if (patch.op && patch.op !== p.op) {
        const wantsList = patch.op === "in" || patch.op === "not_in";
        const hasList = Array.isArray(merged.value);
        if (wantsList && !hasList) {
          const sig = signalsByName.get(merged.signal);
          merged.value = sig ? [defaultValueFor(sig)] : [];
        } else if (!wantsList && hasList) {
          const sig = signalsByName.get(merged.signal);
          merged.value = sig ? defaultValueFor(sig) : "";
        }
      }
      return merged;
    });
    emit(next);
  };

  const removePredicate = (idx: number) => {
    emit(predicates.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Deny when</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "all_of" | "any_of")}
          disabled={disabled || predicates.length === 0}
          className="h-8 rounded-md border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
        >
          <option value="all_of">all of</option>
          <option value="any_of">any of</option>
        </select>
        <span className="text-muted-foreground">these are true:</span>
      </div>

      {predicates.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          No predicates yet. Add one to start building the condition.
        </div>
      ) : (
        <ul className="space-y-2">
          {predicates.map((p, idx) => (
            <PredicateRow
              key={idx}
              predicate={p}
              signals={signals}
              signal={signalsByName.get(p.signal) ?? null}
              disabled={disabled}
              onChange={(patch) => updatePredicate(idx, patch)}
              onRemove={() => removePredicate(idx)}
            />
          ))}
        </ul>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={addPredicate}
        disabled={disabled || signals.length === 0}
      >
        <Plus className="h-4 w-4" />
        Add predicate
      </Button>
    </div>
  );
}

function PredicateRow({
  predicate,
  signal,
  signals,
  disabled,
  onChange,
  onRemove,
}: {
  predicate: Predicate;
  signal: SignalInfo | null;
  signals: SignalInfo[];
  disabled?: boolean;
  onChange: (patch: Partial<Predicate>) => void;
  onRemove: () => void;
}) {
  const ops: PolicyOperator[] =
    signal?.kind === "number" ? NUMBER_OPS : NON_NUMBER_OPS;

  return (
    <li className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 rounded-md border bg-card p-2">
      <select
        value={predicate.signal}
        onChange={(e) => onChange({ signal: e.target.value })}
        disabled={disabled}
        className="h-9 rounded-md border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
      >
        {signals.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
            {s.unit ? ` (${s.unit})` : ""}
          </option>
        ))}
      </select>

      <select
        value={predicate.op}
        onChange={(e) => onChange({ op: e.target.value as PolicyOperator })}
        disabled={disabled}
        className="h-9 rounded-md border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>

      <ValueInput
        predicate={predicate}
        signal={signal}
        disabled={disabled}
        onChange={(value) => onChange({ value })}
      />

      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onRemove}
        disabled={disabled}
        className="h-9 w-9"
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">Remove predicate</span>
      </Button>
    </li>
  );
}

function ValueInput({
  predicate,
  signal,
  disabled,
  onChange,
}: {
  predicate: Predicate;
  signal: SignalInfo | null;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const isList = predicate.op === "in" || predicate.op === "not_in";
  const kind = signal?.kind ?? "string";

  if (isList) {
    const arr = Array.isArray(predicate.value) ? predicate.value : [];
    const asText = arr.join(", ");
    return (
      <Input
        type="text"
        value={asText}
        disabled={disabled}
        placeholder={
          kind === "number" ? "12, 24, 30" : "kitchen, bedroom, lobby"
        }
        onChange={(e) => {
          const parts = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (kind === "number") {
            onChange(parts.map((p) => {
              const n = Number(p);
              return Number.isFinite(n) ? n : p;
            }));
          } else {
            onChange(parts);
          }
        }}
      />
    );
  }

  if (kind === "bool") {
    return (
      <select
        value={String(predicate.value)}
        onChange={(e) => onChange(e.target.value === "true")}
        disabled={disabled}
        className="h-9 rounded-md border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (kind === "enum" && signal?.enum_values) {
    const current =
      typeof predicate.value === "string" ? predicate.value : signal.enum_values[0];
    return (
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-9 rounded-md border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
      >
        {signal.enum_values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  if (kind === "number") {
    return (
      <Input
        type="number"
        value={
          typeof predicate.value === "number" ? predicate.value : ""
        }
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        placeholder={signal?.unit ?? ""}
      />
    );
  }

  return (
    <Input
      type="text"
      value={typeof predicate.value === "string" ? predicate.value : ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function defaultValueFor(signal: SignalInfo): unknown {
  switch (signal.kind) {
    case "number":
      return 0;
    case "bool":
      return true;
    case "enum":
      return signal.enum_values?.[0] ?? "";
    case "string":
      return "";
  }
}
