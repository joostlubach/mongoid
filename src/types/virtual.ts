import { OpenAPISchemaObject, Type, TypeOptions } from 'validator'

export interface VirtualOptions {
  get?:     (item: any) => any
  openAPI?: OpenAPISchemaObject
}

export function virtual(options: TypeOptions<any> & VirtualOptions = {}): Type<any, any> {
  return {
    name:    'virtual',
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

    openAPI: options.openAPI,
  }
}

export function isVirtual(type: Type<any, any>): boolean {
  return !!type.options.virtual
}
