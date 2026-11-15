import type { ISODate } from '../types'

interface DateRangeFieldsProps {
  start: ISODate
  end: ISODate
  min: ISODate
  onChange: (start: ISODate, end: ISODate) => void
}

export default function DateRangeFields({ start, end, min, onChange }: DateRangeFieldsProps) {
  return (
    <div className="date-fields">
      <label className="field">
        <span className="field__label">Start date</span>
        <input
          type="date"
          min={min}
          value={start}
          // Keep the end date from landing before the new start date.
          onChange={(e) => onChange(e.target.value, end && end < e.target.value ? e.target.value : end)}
        />
      </label>
      <label className="field">
        <span className="field__label">End date</span>
        <input type="date" min={start || min} value={end} onChange={(e) => onChange(start, e.target.value)} />
      </label>
    </div>
  )
}
