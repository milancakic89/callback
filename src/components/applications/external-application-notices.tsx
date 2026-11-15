import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/applications/types";

// The two answers /applications/new gives instead of its form (features/chrome-extension.md): the link
// doesn't name a job we can add, or the candidate already has it. Both lead back to the list.

function BackToApplications() {
  return (
    <Button variant="outline" nativeButton={false} render={<Link href="/applications" />}>
      Go to your applications
    </Button>
  );
}

export function InvalidTrackLink() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">This link doesn&apos;t point to a job we can add</CardTitle>
        <CardDescription>
          Callback for Chrome adds jobs from LinkedIn, HelloWorld and Infostud. Open the job on one of them and press
          Add to Callback next to its Apply button.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BackToApplications />
      </CardContent>
    </Card>
  );
}

export function AlreadyTracked({
  title,
  companyName,
  status,
}: {
  title: string;
  companyName: string;
  status: ApplicationStatus;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Already in your applications</CardTitle>
        <CardDescription>
          {title} at {companyName} is on your list. Its status is{" "}
          <span className="font-medium text-foreground">{APPLICATION_STATUS_LABELS[status]}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BackToApplications />
      </CardContent>
    </Card>
  );
}
