import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface SettingsConfirmActionProps {
  title: ReactNode;
  description: ReactNode;
  actionLabel: string;
  onAction: () => void;
  trigger?: ReactNode;
  triggerLabel?: string;
  media?: ReactNode;
}

export function SettingsConfirmAction({
  title,
  description,
  actionLabel,
  onAction,
  trigger,
  triggerLabel,
  media,
}: SettingsConfirmActionProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="sm">
            {triggerLabel ?? actionLabel}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          {media ? (
            <AlertDialogMedia className="bg-transparent">
              {media}
            </AlertDialogMedia>
          ) : null}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-small text-foreground-dim">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
          <AlertDialogAction size="sm" variant="destructive" onClick={onAction}>
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
