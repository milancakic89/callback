"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 10_000;

// The job form (features/companies.md): the fields on the left, and on the right the posting as a
// candidate will see it. There is no <form> and no Server Action: nothing is stored yet, and the
// Apply button is the candidate's, so it does nothing here either.
export function JobEditor({ companyName }: { companyName: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
        <div className="grid gap-2">
          <Label htmlFor="job-title">Title</Label>
          <Input
            id="job-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={TITLE_MAX}
            placeholder="Senior React Developer"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="job-description">Description</Label>
          <Textarea
            id="job-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={12}
            placeholder="What the role involves, what you are looking for, what you offer."
          />
        </div>
      </div>

      <Card aria-label="Candidate preview">
        <CardHeader className="border-b">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Candidate preview
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1">
            <CardTitle className={title.trim() ? "text-xl" : "text-xl text-muted-foreground"}>
              {title.trim() || "Job title"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{companyName}</p>
          </div>
          {/* Plain text, never HTML: the description is whatever the employer typed. */}
          <p className="min-h-24 text-sm whitespace-pre-wrap wrap-anywhere">
            {description.trim() || <span className="text-muted-foreground">The description appears here.</span>}
          </p>
          <div className="grid gap-2">
            <Button type="button" size="lg" className="w-full sm:w-fit">
              Apply
            </Button>
            <p className="text-xs text-muted-foreground">Preview: candidates will apply here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
