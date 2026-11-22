import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-semibold",
    "transition-[background-color,box-shadow,transform,color] duration-150 ease-out",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(15_20_45/0.25)] hover:bg-primary-hover",
        secondary:
          "bg-surface text-ink border border-hairline-strong shadow-[0_1px_2px_rgb(30_26_20/0.05)] hover:bg-surface-2",
        ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
        soft: "bg-primary-soft text-primary-text hover:brightness-[0.97]",
        accent: "bg-accent text-[#2a1a00] hover:brightness-105",
        danger: "bg-danger-soft text-danger border border-danger-line hover:brightness-[0.98]",
        whatsapp: "bg-[#0d7a3e] text-white hover:bg-[#0b6a35] shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]",
      },
      size: {
        sm: "h-9 rounded-lg px-3 text-sm",
        md: "h-11 rounded-xl px-4 text-sm",       // 44px: the minimum tap target
        lg: "h-13 rounded-xl px-5 text-base",
        icon: "size-11 rounded-xl",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, block, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}

export { buttonVariants };
