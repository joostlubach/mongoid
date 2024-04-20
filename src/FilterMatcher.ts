import { every, isArray, isEqual, size, some } from 'lodash'
import { DateTime } from 'luxon'
import {
  arrayEquals,
  isObject,
  isPlainObject,
  objectEntries,
  objectEquals,
  objectKeys,
  UnknownObject,
} from 'ytil'

export default class FilterMatcher {

  constructor(
    private readonly filters: Record<string, any>,
  ) {}

  public matches(doc: any) {
    return this.matchFilter(doc, this.filters)
  }

  private matchFilter(doc: any, condition: any) {
    const lhsKeys = isPlainObject(condition)
      ? objectKeys(condition).filter(it => typeof it === 'string' && it.startsWith('$'))
      : []
    if (lhsKeys.length > 0 && lhsKeys.length < objectKeys(condition).length) {
      throw new Error("Cannot mix TopLevel and Value filters")
    }

    if (lhsKeys.length > 0) {
      return this.matchTopLevel(doc, condition)
    } else {
      return this.matchValue(doc, condition)
    }
  }

  private matchTopLevel(fragment: any, filter: Record<string, any>) {
    const recurse = (fragment: any, arg: any) => this.matchFilter(fragment, arg)

    for (const [key, cond] of objectEntries(filter)) {
      const matcher = TOPLEVEL[key]
      if (matcher == null) {
        throw new Error(`Unknown filter operator: ${String(key)}`)
      }
      if (!matcher(fragment, cond, recurse)) {
        return false
      }
    }

    return true
  }

  private matchValue(value: any, condition: any, invert?: boolean) {
    // 1. If the value is low level equal, immediately match.
    if (value === condition) {
      return true
    }

    const recurse = (value: any, condition: any): boolean => this.matchValue(value, condition)

    if (isArray(value) && isArray(condition)) {
      // 1. If both are an array, just compare the arrays.
      return arrayEquals(value, condition)
    }

    // 2. Match some common condition types.
    if (isArray(condition)) {
      return VALUE.$in(value, condition, recurse)
    }
    if (condition instanceof RegExp) {
      return VALUE.$regex(value, condition, recurse)
    }
    if (condition instanceof Date) {
      return VALUE.$eq(value, condition.getTime(), recurse)
    }
    if (condition instanceof DateTime) {
      return VALUE.$eq(value, condition.toMillis(), recurse)
    }

    // 3. Run through the condition. Each key that starts with '$' is interpreted as a filter function operating
    //    on the entire value. Other keys are interpreted as a condition for a nested property.
    if (isPlainObject(condition)) {
      for (const [key, cond] of objectEntries(condition)) {
        if (typeof key === 'string' && key.charAt(0) === '$') {
          const matcher = VALUE[key]
          if (matcher == null) { throw new Error(`Unknown filter operator: ${String(key)}`) }

          if (isArray(value) && VALUE.$elemMatch(value, {[key]: cond}, recurse)) { return true }
          return matcher(value, cond, recurse)
        } else if (isArray(value) && VALUE.$elemMatch(value, cond, recurse)) {
          // For non-filter keys, if the value is an array and the condition is not met on the array
          // as a whole, try to match the condition on each element.
          return true
        } else if (!recurse(value[key], cond)) {
          return false
        }
      }

      // All keys check out.
      return true
    }

    return VALUE.$eq(value, condition, recurse)
  }

}

type TopLevelMatcherFunction = (fragment: any, condition: any, recurse: (fragment: any, condition: any) => boolean) => boolean
type ValueMatcherFunction = (value: any, condition: any, recurse: (value: any, condition: any) => boolean) => boolean

const TOPLEVEL: Record<string, TopLevelMatcherFunction> = {

  $not(fragment, condition, recurse) {
    return !recurse(fragment, condition)
  },

  $or(fragment, condition, recurse) {
    const conditions = isArray(condition) ? condition : [condition]
    return some(conditions, it => recurse(fragment, it))
  },

  $nor(fragment, condition, recurse) {
    return !TOPLEVEL.$or(fragment, condition, recurse)
  },

  $and(fragment, condition, recurse) {
    const conditions = isArray(condition) ? condition : [condition]
    return every(conditions, it => recurse(fragment, it))
  },

  $nand(fragment, condition, recurse) {
    return !TOPLEVEL.$and(fragment, condition, recurse)
  },

  $expr(fragment, conditions, recurse) {
    throw new Error("$expr filters are not yet supported")
  },

}

const VALUE: Record<string, ValueMatcherFunction> = {

  $cb(value, condition) {
    return condition(value)
  },

  $eq(value, condition) {
    if (value === condition) { return true }

    if (value instanceof Date) {
      return value.getTime() === dateToMillis(condition)
    }

    if (value instanceof DateTime) {
      return value.toMillis() === dateToMillis(condition)
    }

    if (isArray(value) && isArray(condition)) {
      return arrayEquals(value, condition)
    }

    if (isObject<UnknownObject>(value) && isObject<UnknownObject>(condition)) {
      return objectEquals(value, condition)
    }

    return false
  },

  $exists(value, condition) {
    return (value !== undefined) === !!condition
  },

  $deepEquals(value, condition) {
    return isEqual(value, condition)
  },

  $not(value, condition, recurse) {
    return !recurse(value, condition)
  },

  $ne(value, condition, recurse) {
    return !VALUE.$eq(value, condition, recurse)
  },

  $nor(value, condition, recurse) {
    return !VALUE.$or(value, condition, recurse)
  },

  $and(value, condition, recurse) {
    const conditions = isArray(condition) ? condition : [condition]
    return every(conditions, it => recurse(value, it))
  },

  $or(value, condition, recurse) {
    const conditions = isArray(condition) ? condition : [condition]
    return some(conditions, it => recurse(value, it))
  },

  $null(value) {
    if (value == null) { return true }
    if (isArray(value)) { return every(value, it => it == null) }
    return false
  },

  $in(value, condition, recurse) {
    if (!isArray(condition)) {
      throw new Error("$in requires an array operand")
    }

    const values = isArray(value) ? value : [value]
    return every(values, it => some(condition, cond => recurse(it, cond)))
  },

  $likeI(value, condition) {
    if (typeof condition !== 'string') {
      throw new Error("$likeI requires a string operand")
    }
    if (value == null) { return false }

    value = value.toString().toLowerCase()
    condition = condition.toString().toLowerCase()
    return value.includes(condition)
  },

  $like(value, condition) {
    if (typeof condition !== 'string') {
      throw new Error("$like requires a string operand")
    }
    if (value == null) { return false }

    value = value.toString()
    condition = condition.toString()
    return value.includes(condition)
  },

  $startsWith(value, condition) {
    if (typeof condition !== 'string') {
      throw new Error("$startsWith requires a string operand")
    }
    if (value == null) { return false }

    return value.toString().startsWith(condition)
  },

  $endsWith(value, condition) {
    if (typeof condition !== 'string') {
      throw new Error("$startsWith requires a string operand")
    }
    if (value == null) { return false }

    return value.toString().endsWith(condition)
  },

  $elemMatch(value, condition, recurse) {
    if (!isPlainObject(condition)) {
      throw new Error("$elemMatch requires an object operand")
    }

    const values = isArray(value) ? value : [value]
    return some(values, it => recurse(it, condition))
  },

  $contains(value, condition) {
    const values = isArray(value) ? value : [value]
    return values.includes(condition)
  },

  $nin(values, condition, recurse) {
    return !VALUE.$in(values, condition, recurse)
  },

  $regex(value, condition) {
    const values = isArray(value) ? value : [value]
    const regex = condition instanceof RegExp ? condition : new RegExp(condition)
    return every(values, it => regex.test(it))
  },

  $lt(value, ref) {
    const values = isArray(value) ? value : [value]
    return every(values, it => it < ref)
  },

  $gt(value, ref) {
    const values = isArray(value) ? value : [value]
    return every(values, it => it > ref)
  },

  $lte(value, ref) {
    const values = isArray(value) ? value : [value]
    return every(values, it => it <= ref)
  },

  $gte(value, ref) {
    const values = isArray(value) ? value : [value]
    return every(values, it => it >= ref)
  },

  $between(value, ref, recurse) {
    if (!isArray(ref) || ref.length !== 2) {
      throw new Error("$between requires an array operand of length 2")
    }

    const [earliest, latest] = ref
    if (VALUE.before(earliest, value, recurse)) { return false }
    if (VALUE.after(latest, value, recurse)) { return false }
    return true
  },

  $before(value, ref) {
    value = dateToMillis(value)
    ref = dateToDateTime(ref)

    return value < ref
  },

  $after(value, ref) {
    value = dateToMillis(value)
    ref = dateToDateTime(ref)

    return value > ref
  },

  $type(values, ref) {
    if (ref === 'string') {
      return typeof values === 'string'
    } else if (ref === 'number') {
      return typeof values === 'number'
    } else if (ref === 'boolean') {
      return typeof values === 'boolean'
    } else if (ref === 'array') {
      return isArray(values)
    } else if (ref === 'object') {
      return isPlainObject(values)
    } else if (ref === 'date') {
      return values instanceof Date || values instanceof DateTime
    } else if (ref === 'regex') {
      return values instanceof RegExp
    } else if (ref === 'null') {
      return values === null
    } else if (ref === 'undefined') {
      return values === undefined
    } else {
      return values instanceof ref
    }
  },

  $size(values, ref) {
    return size(values) === ref
  },

  $mod(value, ref) {
    if (!isArray(ref) || ref.length !== 2) {
      throw new Error("$mod requires an array operand of length 2")
    }

    return value % ref[0] === ref[1]
  },

  $equal(value, ref, recurse) {
    return VALUE.$eq(value, ref, recurse)
  },

}

function dateToMillis(date: string | number | Date | DateTime) {
  if (date instanceof Date) {
    return date.getTime()
  } else if (date instanceof DateTime) {
    return date.toMillis()
  } else if (typeof date === 'string') {
    return (new Date(date)).getTime()
  } else {
    return date
  }
}

function dateToDateTime(date: string | number | Date | DateTime) {
  if (date instanceof Date) {
    return DateTime.fromMillis(date.getTime())
  } else if (date instanceof DateTime) {
    return date
  } else if (typeof date === 'string') {
    return DateTime.fromMillis((new Date(date)).getTime())
  } else {
    return DateTime.fromMillis(date)
  }
}