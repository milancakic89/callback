"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FilterRuleRow, type DescriptionStatus } from "./filter-rule";
import { FIELD_LABELS, emptyRule, type FilterField, type FilterRule } from "@/lib/jobs/filter-schema";

type FilterBarProps = {
  rules: FilterRule[];
  fields: readonly FilterField[];
  descriptionStatus: DescriptionStatus;
  onRulesChange: (rules: FilterRule[]) => void;
  onRetryDescriptions: () => void;
};

// A list of rules combined with AND, each one optionally holding several values — see
// features/dashboard.md "Filters are a list of rules."
export function FilterBar({ rules, fields, descriptionStatus, onRulesChange, onRetryDescriptions }: FilterBarProps) {
  const [addOpen, setAddOpen] = useState(false);

  function addRule(field: FilterField) {
    onRulesChange([...rules, emptyRule(field)]);
    setAddOpen(false);
  }
  function updateRule(id: string, next: FilterRule) {
    onRulesChange(rules.map((rule) => (rule.id === id ? next : rule)));
  }
  function removeRule(id: string) {
    onRulesChange(rules.filter((rule) => rule.id !== id));
  }

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {/* Capped so a long rule list scrolls in place instead of pushing the table down (or, in
          fillHeight mode, shrinking it) — see features/dashboard.md. */}
      {rules.length > 0 && (
        <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto pr-1">
          {rules.map((rule) => (
            <FilterRuleRow
              key={rule.id}
              rule={rule}
              fields={fields}
              descriptionStatus={descriptionStatus}
              onChange={(next) => updateRule(rule.id, next)}
              onRemove={() => removeRule(rule.id)}
              onRetryDescriptions={onRetryDescriptions}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger
            render={
              <Button type="button" variant="outline" size="sm">
                <PlusIcon /> Add filter
              </Button>
            }
          />
          <PopoverContent className="w-48 p-1" align="start">
            <div className="flex flex-col">
              {fields.map((field) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => addRule(field)}
                  className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  {FIELD_LABELS[field]}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {rules.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onRulesChange([])}>
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
