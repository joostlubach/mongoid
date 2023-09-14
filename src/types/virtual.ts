import { Type, TypeOptions } from 'validator'

export interface VirtualOptions {
  get?: (item: any) => any
}

export default function virtual(options: TypeOptions<any> & VirtualOptions = {}): Type<any, any> {
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

export function isVirtual(type: Type<any, any>): boolean {
  return !!type.options.virtual
}