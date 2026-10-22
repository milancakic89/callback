"use client";

import { Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChipsInput } from "./chips-input";
import {
  FIELD_LABELS,
  OPERATOR_LABELS,
  OPERATORS_BY_FIELD,
  TEXT_FIELDS,
  defaultOperatorFor,
  isFilterField,
  operatorNeedsValues,
  type FilterField,
  type FilterOperator,
  type FilterRule,
} from "@/lib/jobs/filter-schema";
import { WORK_MODES, WORK_MODE_LABELS } from "@/lib/jobs/types";
import { cn } from "cn";

export type DescriptionStatus = "idle" | "loading" | "ready" | "error";

type FilterRuleRowProps = {
  rule: FilterRule;
  fields: readonly FilterField[];
  descriptionStatus: DescriptionStatus;
  onChange: (rule: FilterRule) => void;
  onRemove: () => void;
  onRetryDescriptions: () => void;
};

function isTextField(field: string): field is (typeof TEXT_FIELDS)[number] {
  return (TEXT_FIELDS as readonly string[]).includes(field);
}

// One row of the filter bar: field · operator · value(s). See features/dashboard.md "Filter model".
export function FilterRuleRow({
  rule,
  fields,
  descriptionStatus,
  onChange,
  onRemove,
  onRetryDescriptions,
}: FilterRuleRowProps) {
  // A rule decoded from the URL can name a field this version doesn't recognize (see
  // filter-schema.ts) — treat it as having no operators rather than crashing.
  const operators = isFilterField(rule.field) ? OPERATORS_BY_FIELD[rule.field] : [];
  const isActive = !operatorNeedsValues(rule.operator) || rule.values.some((value) => value.trim());

  function setField(field: FilterField) {
    onChange({ ...rule, field, operator: defaultOperatorFor(field), values: [] });
  }
  function setOperator(operator: string | null) {
    if (operator === null) return;
    onChange({ ...rule, operator, values: [] });
  }
  function setValues(values: string[]) {
    onChange({ ...rule, values });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-1.5 transition-opacity",
        !isActive && "opacity-60",
      )}
    >
      <Select
        value={rule.field}
        onValueChange={(value) => {
          if (value !== null && isFilterField(value)) setField(value);
        }}
      >
        <SelectTrigger size="sm" className="w-32 bg-card">
          {/* Base UI shows the raw value unless told how to render it. */}
          <SelectValue>{(value: string) => FIELD_LABELS[value as FilterField] ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {fields.map((field) => (
            <SelectItem key={field} value={field}>
              {FIELD_LABELS[field]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={rule.operator} onValueChange={setOperator}>
        <SelectTrigger size="sm" className="w-44 bg-card">
          <SelectValue>{(value: string) => OPERATOR_LABELS[value as FilterOperator] ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {operators.map((operator) => (
            <SelectItem key={operator} value={operator}>
              {OPERATOR_LABELS[operator as FilterOperator]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ValueEditor rule={rule} onChange={setValues} />

      {rule.field === "description" && descriptionStatus === "loading" && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin" />
          loading descriptions…
        </span>
      )}
      {rule.field === "description" && descriptionStatus === "error" && (
        <Button type="button" variant="ghost" size="xs" onClick={onRetryDescriptions} className="text-destructive">
          Couldn&apos;t load descriptions · Retry
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label="Remove this filter"
        className="ml-auto"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function ValueEditor({ rule, onChange }: { rule: FilterRule; onChange: (values: string[]) => void }) {
  if (isTextField(rule.field)) {
    if (rule.operator === "is_empty" || rule.operator === "is_not_empty") return null;
    return <ChipsInput values={rule.values} onChange={onChange} placeholder="Type a value, press Enter" />;
  }

  if (rule.field === "workMode") {
    if (rule.operator === "is_unknown") return null;
    return (
      <div className="flex flex-wrap items-center gap-3 px-1">
        {WORK_MODES.map((mode) => (
          <Label key={mode} className="gap-1.5 text-sm font-normal">
            <Checkbox
              checked={rule.values.includes(mode)}
              onCheckedChange={(checked) =>
                onChange(checked === true ? [...rule.values, mode] : rule.values.filter((v) => v !== mode))
              }
            />
            {WORK_MODE_LABELS[mode]}
          </Label>
        ))}
      </div>
    );
  }

  if (rule.field === "posted") {
    if (rule.operator === "in_last_days") {
      return (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            placeholder="30"
            className="h-8 w-20"
            value={rule.values[0] ?? ""}
            onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
          />
          <span className="text-sm text-muted-foreground">days</span>
        </div>
      );
    }
    return (
      <Input
        type="date"
        className="h-8 w-40"
        value={rule.values[0] ?? ""}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
      />
    );
  }

  // "applied" — the operator ("is applied" / "is not applied") already says everything.
  return null;
}
