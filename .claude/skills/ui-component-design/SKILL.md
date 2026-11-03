---
name: ui-component-design
description: Use this skill when generating UI components, styling layouts with Tailwind CSS, implementing shadcn/ui patterns, designing responsive views, managing component state, and ensuring WCAG 2.1 AA accessibility compliance.
---

# Accessible UI Component Design & Styling Skill

## 1. Objectives
- Construct modular, accessible UI components based on headless Radix UI primitives and Tailwind CSS.
- Enforce strict WCAG 2.1 AA compliance: full keyboard operability, visible focus rings, ARIA landmark roles, and 4.5:1 text contrast ratios.
- Implement design token abstractions using CSS variables (HSL/OKLCH) supporting effortless light and dark themes.
- Enforce clear architectural boundaries between React Server Components (RSC) and interactive Client Components (`"use client"`).
- Validate visual layout responsiveness and ARIA trees using headless browser automation.

---

## 2. Triggers
Activate this skill when:
- Creating or refactoring UI components (modals, dropdowns, form controls, navigation headers, data tables).
- Styling responsive layouts, hero sections, card grids, or mobile drawers with Tailwind CSS.
- Auditing or remediating accessibility defects (missing keyboard navigation, unlabelled buttons, poor contrast).
- Implementing theme switching or design tokens.
- Triggered explicitly via user prompt or slash command: `/ui`, `/component`, `/accessible-ui`.

---

## 3. Inputs & Prerequisites
Before executing this skill, identify or request:
- **Component Purpose & Specification:** Interactive requirements, expected props, slots, and events.
- **Interactivity Level:** Static presentational display (Server Component) vs. dynamic stateful interaction (Client Component).
- **Accessibility Contract:**
  - Keyboard triggers: `Tab` for focus traversal, `Enter`/`Space` for activation, `Escape` for dismissal, Arrow keys for menu navigation.
  - ARIA attributes: `aria-expanded`, `aria-haspopup`, `aria-controls`, `aria-describedby`, `role="dialog"`.
- **Styling Tokens:** Primary, accent, background, foreground, border, and ring CSS variable tokens.

---

## 4. Architectural Rules & Best Practices

1. **Server Components by Default:**
   - Keep data fetching and static markup in React Server Components.
   - Restrict `"use client"` exclusively to leaf interactive components requiring hooks (`useState`, `useReducer`, `useEffect`) or browser event listeners (`onClick`, `onKeyDown`).
2. **Class Merging Discipline:**
   - Always export components accepting `className?: string`.
   - Merge default styles with passed overrides using `cn(...)` (`clsx` + `tailwind-merge`).
3. **Touch Targets & Visual Focus:**
   - Interactive targets must measure at least `44x44px` on mobile (`min-h-[44px] min-w-[44px]` or adequate padding).
   - Never suppress outline rings without providing an accessible alternative: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
4. **Accessible Icon Buttons:**
   - Any button containing only an icon MUST include an accessible label via `<span className="sr-only">Label</span>` or `aria-label`.

---

## 5. Step-by-Step Component Creation Procedure

### Step 5.1: Install & Import Headless Radix Primitives
Decouple accessibility logic, keyboard trapping, and screen reader announcements from styling by using Radix UI primitives (`@radix-ui/react-*`).

### Step 5.2: Implement Accessible Modal Dialog Pattern
Create `src/components/ui/dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4",
        "border border-border bg-background p-6 shadow-xl sm:rounded-lg",
        "duration-200",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close dialog</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-foreground",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
};
```

### Step 5.3: Implement Accessible Button with Variant Styles
Create `src/components/ui/button.tsx` using `cva` (class-variance-authority):

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10 min-h-[44px] min-w-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
```

### Step 5.4: Responsive Layout Composition
Compose components following a mobile-first approach:
- Default styles apply to mobile viewports (`< 640px`).
- Breakpoints scale up: `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px).
- Avoid fixed pixel widths; use relative scaling (`w-full max-w-2xl mx-auto`).

---

## 6. Tool Synergies (Playwright MCP Integration)
Verify the rendered component in a live browser session using Playwright MCP:

1. **Render Navigation:**
   - Call `playwright_navigate` with `url: "http://localhost:3000/demo/dialog"`.
2. **Visual Verification:**
   - Call `playwright_screenshot` with `width: 375, height: 812` (mobile check).
   - Call `playwright_screenshot` with `width: 1440, height: 900` (desktop check).
3. **Accessibility Tree Audit:**
   - Call `playwright_accessibility_snapshot` to inspect the accessibility node tree.
   - Verify `role="dialog"` is present, `aria-modal="true"` is active, and the focus is trapped inside the dialog container.
4. **Keyboard Interactivity Test:**
   - Send `Escape` keypress via `playwright_keyboard_press`.
   - Confirm dialog closes and focus safely returns to the trigger button.

---

## 7. Concrete Prompt Examples

### Example 1: Creating an Accessible Modal
> "Using the `ui-component-design` skill, build an accessible confirmation modal for deleting a project. It must use Radix Dialog primitives, include an icon button with sr-only label, red destructive confirm button, and support Escape key dismiss and focus trap."

### Example 2: Building an Accessible Form Input Control
> "Create an accessible form input component `src/components/ui/input.tsx` following `ui-component-design`. It should support error states with `aria-invalid`, helper text linked with `aria-describedby`, and focus rings matching our theme tokens."
