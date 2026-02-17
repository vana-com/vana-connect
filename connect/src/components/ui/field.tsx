import { cva, type VariantProps } from "class-variance-authority";
import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        // layout
        "flex flex-col gap-4",
        // conditional gaps
        "has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className,
      )}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        // typography
        "font-medium data-[variant=label]:text-xs data-[variant=legend]:text-sm",
        // spacing
        "mb-2.5",
        className,
      )}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        // layout
        "flex w-full flex-col gap-5 group/field-group @container/field-group",
        // conditional gaps
        "data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4",
        className,
      )}
      {...props}
    />
  );
}

const fieldVariants = cva(
  [
    // layout
    "flex w-full gap-2 group/field",
    // states
    "data-[invalid=true]:text-destructive",
  ],
  {
    variants: {
      orientation: {
        vertical: [
          // layout
          "flex-col [&>*]:w-full [&>.sr-only]:w-auto",
        ],
        horizontal: [
          // layout
          "flex-row items-center [&>[data-slot=field-label]]:flex-auto",
          // content alignment
          "has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        ],
        responsive: [
          // layout
          "flex-col [&>*]:w-full [&>.sr-only]:w-auto",
          // responsive
          "@md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto @md/field-group:[&>[data-slot=field-label]]:flex-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        ],
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  },
);

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: intentional div+role for styling compatibility
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        // layout
        "flex flex-1 flex-col gap-0.5 group/field-content",
        // typography
        "leading-snug",
        className,
      )}
      {...props}
    />
  );
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        // layout
        "flex w-fit gap-2 group/field-label peer/field-label leading-snug",
        // states
        "has-data-checked:bg-primary/5 has-data-checked:border-primary dark:has-data-checked:bg-primary/10 group-data-[disabled=true]/field:opacity-50",
        // nested field
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-none has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-2",
        className,
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        // layout
        "flex w-fit items-center gap-2",
        // typography
        "text-xs/relaxed leading-snug",
        // states
        "group-data-[disabled=true]/field:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        // typography
        "text-xs/relaxed text-left text-muted-foreground leading-normal font-normal group-has-[[data-orientation=horizontal]]/field:text-balance",
        // spacing
        "[[data-variant=legend]+&]:-mt-1.5 last:mt-0 nth-last-2:-mt-1",
        // links
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        // layout
        "relative h-5 -my-2 group-data-[variant=outline]/field-group:-mb-2",
        // typography
        "text-xs",
        className,
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className={cn(
            // layout
            "relative mx-auto block w-fit",
            // typography
            "text-xs text-muted-foreground",
            // colors
            "bg-background",
            // spacing
            "px-2",
          )}
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors?.length) {
      return null;
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ];

    if (uniqueErrors?.length === 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && (
              // biome-ignore lint/suspicious/noArrayIndexKey: static error list, no reordering
              <li key={index}>{error.message}</li>
            ),
        )}
      </ul>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn(
        // typography
        "text-xs font-normal text-destructive",
        className,
      )}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
