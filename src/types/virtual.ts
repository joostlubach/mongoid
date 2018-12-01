import {Type, TypeOptions} from '@joostlubach/validator'

export default function virtual(options: TypeOptions<any> = {}): Type<any> {
  return {
    options: {
      required: false,
      virtual:  true,
    },
    cast(value: any) {
      return value
    },
    serialize(value: any) {
      return value
    },
    validate() {
      // No-op
    }
  }
}

export function isVirtual(type: Type<any>): boolean {
  return !!type.options.virtual
}