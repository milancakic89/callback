"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration } from "@/lib/interviews/format";
import { INTERVIEW_DURATIONS, INTERVIEW_MESSAGE_MAX } from "@/lib/interviews/schedule";
import type { ScheduleDraft } from "@/lib/interviews/schedule-form";
import type { GoogleStatus } from "@/lib/interviews/types";
import { cn } from "cn";

// The fields for one invitation (features/interview-invitations.md): the day, the time, the length and an
// optional message. Used by the Apply statuses dialog, once for each candidate moved to an interview step,
// and by the Interview panel's "Send invitation". `showToggle` adds the checkbox that turns the invitation
// off (applying the status needs no invitation); without Google the toggle is locked off and says why.
export function InterviewScheduleFields({
  idPrefix,
  draft,
  onChange,
  timeZone,
  problem,
  google,
  settingsHref,
  showToggle,
}: {
  idPrefix: string;
  draft: ScheduleDraft;
  onChange: (change: Partial<ScheduleDraft>) => void;
  timeZone: string;
  // What is wrong with the draft, shown under the fields.
  problem: string | null;
  google: GoogleStatus;
  settingsHref: string;
  showToggle: boolean;
}) {
  const usable = google.configured && google.connected && !google.broken;
  const active = usable && draft.send;
  const today = new Date();
  // The date input's lower bound, in the browser's own day.
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="grid gap-3">
      {showToggle && (
        <div className="flex items-start gap-2">
          <Checkbox
            id={`${idPrefix}-send`}
            checked={active}
            disabled={!usable}
            onCheckedChange={(checked) => onChange({ send: checked === true })}
            className="mt-0.5"
          />
          <Label htmlFor={`${idPrefix}-send`} className="text-sm leading-snug">
            Send a Google Meet invitation
          </Label>
        </div>
      )}
      {!usable && (
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {google.configured ? (
            <>
              {google.broken ? "Google Calendar needs to be connected again" : "Google Calendar isn't connected"}.{" "}
              <Link href={settingsHref} className="font-medium text-foreground underline underline-offset-4">
                Open Settings
              </Link>{" "}
              to {google.broken ? "reconnect" : "connect"} it.
            </>
          ) : (
            "Google Calendar isn't set up on this server, so no invitation can be sent."
          )}
        </p>
      )}

      {active && (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${idPrefix}-date`} className="text-[12.5px]">
                Date
              </Label>
              <Input
                id={`${idPrefix}-date`}
                type="date"
                min={minDate}
                value={draft.date}
                onChange={(event) => onChange({ date: event.target.value })}
                aria-invalid={Boolean(problem)}
                aria-describedby={`${idPrefix}-problem`}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${idPrefix}-time`} className="text-[12.5px]">
                Time
              </Label>
              <Input
                id={`${idPrefix}-time`}
                type="time"
                step={300}
                value={draft.time}
                onChange={(event) => onChange({ time: event.target.value })}
                aria-invalid={Boolean(problem)}
                aria-describedby={`${idPrefix}-problem`}
              />
            </div>
          </div>
          <p className="-mt-1 text-[11.5px] text-muted-foreground">Time zone: {timeZone}</p>

          <div className="grid gap-1.5">
            <p className="text-[12.5px] font-medium" id={`${idPrefix}-length`}>
              Length
            </p>
            <div role="group" aria-labelledby={`${idPrefix}-length`} className="flex flex-wrap gap-1">
              {INTERVIEW_DURATIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={draft.durationMinutes === minutes}
                  onClick={() => onChange({ durationMinutes: minutes })}
                  className={cn(
                    "h-8 rounded-md border px-2.5 text-[12.5px] transition-colors",
                    draft.durationMinutes === minutes
                      ? "border-transparent bg-white/[0.12] font-medium text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {formatDuration(minutes)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-message`} className="text-[12.5px]">
              Message to the candidate (optional)
            </Label>
            <Textarea
              id={`${idPrefix}-message`}
              value={draft.message}
              onChange={(event) => onChange({ message: event.target.value })}
              maxLength={INTERVIEW_MESSAGE_MAX}
              rows={2}
              placeholder="A short call with our recruiter."
            />
          </div>

          <p id={`${idPrefix}-problem`} role={problem ? "alert" : undefined} className="min-h-4 text-[12.5px] text-destructive">
            {problem}
          </p>
        </div>
      )}
    </div>
  );
}
