import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The one button style for the app. Use `<Button>` for buttons, and
 * `className={buttonVariants({ ... })}` on a `<Link>` that should look like one.
 *
 *  - primary:   the main action on a page or dialog (one per view)
 *  - secondary: everything else that is a real action
 *  - ghost:     low-key actions inside rows and toolbars
 *  - danger:    opens a delete or cancel step
 *  - destructive: the final "yes, delete it" in a confirmation
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-amber-500 text-black hover:bg-amber-400",
        secondary:
          "border border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-white",
        ghost: "text-zinc-300 hover:bg-zinc-800/80 hover:text-white",
        danger: "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200",
        destructive: "bg-red-600 text-white hover:bg-red-500",
      },
      size: {
        sm: "min-h-8 px-3 py-1.5 text-xs [&_svg]:size-3.5",
        md: "min-h-9 px-4 py-2 text-xs [&_svg]:size-3.5",
        lg: "min-h-11 px-5 py-2.5 text-sm [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...(asChild ? {} : { type: type ?? "button" })}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
