import { DateTime } from 'luxon'
import { defineType, INVALID, TypeOptions, ValidatorResult } from 'validator'

export interface DateTimeOptions extends TypeOptions<DateTime> {
  after?:  DateTime
  before?: DateTime
}

export const dateTime = defineType<DateTime, DateTimeOptions>('date', (options: DateTimeOptions) => ({
  coerce: raw => {
    if (DateTime.isDateTime(raw)) { return raw }

    if (raw instanceof Date) {
      return DateTime.fromJSDate(raw)
    } else if (typeof raw === 'number') {
      return DateTime.fromMillis(raw, {zone: 'utc'})
    } else if (typeof raw === 'string') {
      return DateTime.fromISO(raw, {zone: 'utc'})
    } else {
      return INVALID
    }
  },

  serialize: value => value,

  validate(value: any, result: ValidatorResult<any>) {
    if (!DateTime.isDateTime(value) || !value.isValid) {
      result.addError('invalid_type', 'Expected a value DateTime object')
      return
    }

    if (options.after != null && value < options.after) {
      result.addError('date.too_early', `This value should be after ${options.after}`)
    }
    if (options.before != null && value > options.before) {
      result.addError('date.too_late', `This value should be before ${options.before}`)
    }
  },

  openAPI: {
    type:   'string',
    format: 'date-time',
  },
}))
