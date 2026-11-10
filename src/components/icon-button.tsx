import * as React from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type Props = React.ComponentProps<typeof Button> & {
  /** Accessible name of the button */
  label: string
  /** Tooltip text, when it should be shorter than the label */
  tooltip?: string
  side?: "top" | "bottom" | "left" | "right"
  /** A PopoverTrigger or DropdownMenuTrigger element, when the button also opens one */
  trigger?: React.ReactElement<{ render?: React.ReactElement }>
}

/** A button that shows only an icon. It always has a tooltip that says what it does. */
export function IconButton({ label, tooltip = label, side = "top", trigger, children, ...props }: Props) {
  const button = <Button aria-label={label} {...props} />
  return (
    <Tooltip>
      <TooltipTrigger render={trigger ? React.cloneElement(trigger, { render: button }) : button}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
