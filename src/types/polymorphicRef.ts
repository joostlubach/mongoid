import { INVALID, Type, TypeOptions, ValidatorResult } from 'validator'
import { isID } from '../ID'
import Model from '../Model'
import models from '../models'
import { ID, IDOf } from '../typings'
import { Ref, RefDeleteStrategy, RefModel } from './ref'

export interface Options<PM extends Model = any> {
  models?:   string[]
  onDelete?: RefDeleteStrategy<PM>
}

function polymorphicRef<PM extends Model = any>(options: TypeOptions<PolymorphicRef> & Options<PM> & {required: false}): Type<PolymorphicRef> & {options: {required: false}}
function polymorphicRef<PM extends Model = any>(options: TypeOptions<PolymorphicRef> & Options<PM> & {required?: true}): Type<PolymorphicRef> & {options: {required: true}}
function polymorphicRef<PM extends Model = any>(options: TypeOptions<PolymorphicRef> & Options<PM>): Type<PolymorphicRef> {
  return {
    name: 'polymorphicRef',
    options,

    coerce(value: any): PolymorphicRef | INVALID {
      if (isPolymorphicRef(value)) { return value }
      if (typeof value !== 'object') { return INVALID }
      if (value == null) { return INVALID }

      // Check for a ref plain object.
      if ('model' in value && 'id' in value) {
        const model = models[value.model]
        if (model == null) { return INVALID }

        return new PolymorphicRef(model, value.id)
      } else if (value instanceof Ref) {
        // Check for a regular Ref object.
        return new PolymorphicRef(value.Model, value.id)
      } else {
        // Check for an actual model instance.
        if (!isID(value.id)) { return INVALID }

        const modelName: string = value.constructor?.name
        if (options.models != null && !options.models.includes(modelName)) { return INVALID }

        const model = models[modelName]
        if (model == null) { return INVALID }

        return new PolymorphicRef(model, value.id)
      }
    },

    serialize(ref: any): any {
      return ref instanceof PolymorphicRef
        ? {model: ref.Model.name, id: ref.id}
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

  constructor(Model: RefModel<M>, id: ID) {
    super(Model, id as IDOf<M>)
    Object.defineProperty(this, 'cache', {enumerable: false})
  }

  public async get(): Promise<M | null> {
    if (this.cache !== undefined) {
      return this.cache
    }

    const query = this.Model.query()
    const model = await query.get(this.id)

    this.cache = model
    return model
  }

}

export function isPolymorphicRef<M extends Model = any>(value: any): value is PolymorphicRef<M> {
  return value instanceof PolymorphicRef
}

export default polymorphicRef