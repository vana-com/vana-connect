"use client";

import Link from "next/link";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { VanaLogotype } from "@/components/icons/vana-logotype";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";

export default function AdminAppsPage() {
  return (
    <PageShell showBackButton={false} showLogoutButton>
      <PagePanel>
        <div className="mx-auto w-full max-w-3xl space-y-small">
          <div className="space-y-w6">
            <div className="space-y-2.5">
              <VanaLogotype height={13} className="text-iris" />
              <Text as="h1" intent="title">
                <span className="text-iris">Your apps</span>
              </Text>
            </div>
            <Text>
              Registered builder apps for this account will appear here.
            </Text>
          </div>

          <div className="rounded-button border border-input p-small">
            <Text intent="small" muted>
              No apps registered yet.
            </Text>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href="/admin">Register a new app</Link>
          </Button>
        </div>
      </PagePanel>
    </PageShell>
  );
}
