import { ChevronDownIcon, ChevronUpIcon, LockIcon, Trash2Icon } from "lucide-react";
import { FieldError } from "@/components/auth/form-feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canRemoveStep, STEP_DESCRIPTION_MAX, STEP_NAME_MAX, type StepDraft } from "@/lib/companies/candidate-steps";

// One editable step in the settings form (features/candidate-steps.md): its name, the text the candidate
// reads behind the info icon, and buttons to move it or remove it. A step an application has been on
// can be renamed and moved, but not removed. No hooks: the editor owns the state.
export function CandidateStepFields({
  draft,
  index,
  total,
  nameErrors,
  descriptionErrors,
  onChange,
  onMove,
  onRemove,
}: {
  draft: StepDraft;
  index: number;
  total: number;
  nameErrors?: string[];
  descriptionErrors?: string[];
  onChange: (change: { name?: string; description?: string; schedulesInterview?: boolean }) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}) {
  const id = `step-${draft.key}`;
  const removable = canRemoveStep(draft);

  return (
    <li className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-7 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs"
        >
          {index + 1}
        </span>
        <div className="grid min-w-0 flex-1 gap-2">
          <Label htmlFor={`${id}-name`}>Step {index + 1} name</Label>
          <Input
            id={`${id}-name`}
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            maxLength={STEP_NAME_MAX}
            placeholder="Interview"
            autoComplete="off"
            aria-invalid={Boolean(nameErrors?.length)}
            aria-describedby={`${id}-name-error`}
          />
          <FieldError id={`${id}-name-error`} errors={nameErrors} />
        </div>
        <div className="mt-6 flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Move step ${index + 1} up`}
            disabled={index === 0}
            onClick={() => onMove("up")}
          >
            <ChevronUpIcon aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Move step ${index + 1} down`}
            disabled={index === total - 1}
            onClick={() => onMove("down")}
          >
            <ChevronDownIcon aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Remove step ${index + 1}`}
            disabled={!removable}
            onClick={onRemove}
          >
            <Trash2Icon aria-hidden />
          </Button>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-description`}>What the candidate sees</Label>
        <Textarea
          id={`${id}-description`}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
          maxLength={STEP_DESCRIPTION_MAX}
          rows={3}
          placeholder="A short call with our recruiter. You will hear from us within 3 working days."
          aria-invalid={Boolean(descriptionErrors?.length)}
          aria-describedby={`${id}-description-error ${id}-description-count`}
        />
        <p id={`${id}-description-count`} className="text-xs text-muted-foreground">
          {draft.description.length} / {STEP_DESCRIPTION_MAX}
        </p>
        <FieldError id={`${id}-description-error`} errors={descriptionErrors} />
      </div>
      {/* features/interview-invitations.md: applying a candidate to this step offers a Google Meet invitation. */}
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${id}-interview`}
          checked={draft.schedulesInterview}
          onCheckedChange={(checked) => onChange({ schedulesInterview: checked === true })}
          className="mt-0.5"
        />
        <div className="grid gap-0.5">
          <Label htmlFor={`${id}-interview`}>Interview step</Label>
          <p className="text-xs text-muted-foreground">
            Applying a candidate to this step lets you send a Google Meet invitation they confirm or decline.
          </p>
        </div>
      </div>
      {!removable && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LockIcon aria-hidden className="size-3.5" />
          An application has been on this step, so it can&rsquo;t be deleted. Rename it instead.
        </p>
      )}
    </li>
  );
}
