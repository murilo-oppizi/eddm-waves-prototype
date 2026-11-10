import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MAX_DATE, MIN_DATE, fmtDate } from "@/lib/eddm"

type Props = {
  value: Date | null
  onChange: (date: Date) => void
  /** Dates already used by other waves */
  taken?: Date[]
  invalid?: boolean
  placeholder?: string
  className?: string
  id?: string
}

/** Mailing date: weekdays only, 7 business days out, up to 360 days ahead. */
export function DatePicker({
  value,
  onChange,
  taken = [],
  invalid,
  placeholder = "Select a date",
  className,
  id,
}: Props) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            aria-invalid={invalid || undefined}
            className={cn(
              "justify-between font-normal tabular-nums",
              !value && "text-muted-foreground",
              className
            )}
          />
        }
      >
        {value ? fmtDate(value) : placeholder}
        <CalendarIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          defaultMonth={value ?? MIN_DATE}
          startMonth={MIN_DATE}
          endMonth={MAX_DATE}
          disabled={[{ before: MIN_DATE }, { after: MAX_DATE }, { dayOfWeek: [0, 6] }, ...taken]}
          onSelect={(d) => {
            if (d) {
              onChange(d)
              setOpen(false)
            }
          }}
        />
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Weekdays only, from {fmtDate(MIN_DATE, "MMM d")}.
        </p>
      </PopoverContent>
    </Popover>
  )
}
