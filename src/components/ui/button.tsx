import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | string;
  size?: 'default' | 'sm' | 'lg' | 'icon' | string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-neutral-100 text-neutral-900 hover:bg-neutral-200": variant === "default",
            "bg-red-500 text-neutral-50 hover:bg-red-500/90": variant === "destructive",
            "border border-black/10 bg-white hover:bg-neutral-100 hover:text-neutral-900": variant === "outline",
            "bg-neutral-100 text-neutral-900 hover:bg-neutral-100/80": variant === "secondary",
            "hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-100 dark:hover:text-neutral-50": variant === "ghost",
            "text-neutral-900 underline-offset-4 hover:underline": variant === "link",
          },
          {
            "h-10 px-4 py-2": size === "default",
            "h-9 rounded-md px-3": size === "sm",
            "h-11 rounded-md px-8": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
