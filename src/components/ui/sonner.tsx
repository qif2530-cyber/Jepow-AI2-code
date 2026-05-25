import * as React from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = "dark" // Default to dark for this app

  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-black group-[.toaster]:text-neutral-100 group-[.toaster]:border-black/10 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl font-medium",
          description: "group-[.toast]:text-neutral-400",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:bg-[#031C0D] group-[.toaster]:border-[#0A3D1E] group-[.toaster]:text-[#22C55E]",
          error: "group-[.toaster]:bg-[#2C0A0A] group-[.toaster]:border-[#5C1A1A] group-[.toaster]:text-[#EF4444]",
          warning: "group-[.toaster]:bg-[#3A2A0D] group-[.toaster]:border-[#7B5915] group-[.toaster]:text-[#EAB308]",
          info: "group-[.toaster]:bg-[#0A1A2C] group-[.toaster]:border-[#1A3D5C] group-[.toaster]:text-[#3B82F6]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
