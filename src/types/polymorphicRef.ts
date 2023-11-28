import { INVALID, Type, TypeOptions, ValidatorResult } from 'validator'

import Model from '../Model'
import { getModelClass } from '../registry'
import { Ref, RefDeleteStrategy } from '../types/ref'
import { ID } from '../typings'

export interface Options<PM extends Model = any> {
  models?:   string[]
  onDelete?: RefDeleteStrategy<PM>
}

export function polymorphicRef<PM extends Model = any>(options: TypeOptions<PolymorphicRef> & Options<PM> & {required: false}): Type<PolymorphicRef, Options<PM>> & {options: {required: false}}
export function polymorphicRef<PM extends Model = any>(options: TypeOptions<PolymorphicRef> & Options<PM> & {required?: true}): Type<PolymorphicRef, Options<PM>> & {options: {required: true}}
export function polymorphicRef<PM extends Model = any>(options: TypeOptions<PolymorphicRef> & Options<PM>): Type<any, any> {
  return {
    name: 'polymorphicRef',
    options,

    coerce(value: any): PolymorphicRef | INVALID {
      if (PolymorphicRef.isPolymorphicRef(value)) { return value }
      if (typeof value !== 'object') { return INVALID }
      if (value == null) { return INVALID }

      // Check for a ref plain object.
      if ('model' in value && 'id' in value) {
        const Model = getModelClass(value.Model)
        if (Model == null) { return INVALID }

        return new PolymorphicRef(Model, value.id)
      } else if (value instanceof Ref) {
        // Check for a regular Ref object.
        return new PolymorphicRef(value.Model, value.id)
      } else {
        // Check for an actual model instance.
        if (!ID.isID(value.id)) { return INVALID }

        const modelName: string = value.constructor?.name
        if (options.models != null && !options.models.includes(modelName)) { return INVALID }

        const Model = getModelClass(modelName)
        if (Model == null) { return INVALID }

        return new PolymorphicRef(Model, value.id)
      }
    },

    serialize(ref: any): any {
      return ref instanceof PolymorphicRef
        ? {model: ref.Model.modelName, id: ref.id}
        : ref
    },

    validate(value: any, result: ValidatorResult<any>) {
      if (!(value instanceof PolymorphicRef)) {
        result.addError('invalid_type', 'Expected a polymorphic reference')
      }
    },
  }
}

export class PolymorphicRef<M extends Model = any> extends Ref<M> {

  public static isPolymorphicRef<M extends Model = any>(value: any): value is PolymorphicRef<M> {
    return value instanceof PolymorphicRef
  }

}
