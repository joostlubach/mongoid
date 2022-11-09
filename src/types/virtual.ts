import { Type, TypeOptions } from 'validator'

interface Options {
  get?: (item: any) => any
}

export default function virtual(options: TypeOptions<any> & Options = {}): Type<any> {
  return {
    name: 'virtual',
    options: {
      required: false,
      virtual:  true,
    },
    coerce(value: any) {
      return value
    },
    serialize(value: any, parent: any) {
      if (options.get && parent != null) {
        return options.get(parent)
      } else {
        return value
      }
    },
    validate() {
      // No-op
    },
  }
}

export function isVirtual(type: Type<any>): boolean {
  return !!type.options.virtual
}