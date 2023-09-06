import { isFunction, omit } from 'lodash'
import { INVALID, Type, TypeOptions, ValidatorResult } from 'validator'
import { isPlainObject } from 'ytil'
import { Reference } from '../backend/ReferentialIntegrity'
import Model from '../Model'
import { getModelClass } from '../registry'
import { ID, IDOf, ModelClass } from '../typings'

export interface Options<PM extends Model = any> {
  /** The name of the model for the ref */
  model: string

  /** The foreign key to use (defaults to `id`.) */
  foreignKey?: string

  /**
   * The strategy to use when the referenced object is deleted.
   *
   * Default: `'ignore'`.
   */
  onDelete?: RefDeleteStrategy<PM>

  /**
   * Set to true to always include this ref when the containing model is loaded.
   */
  include?: RefInclude
}

export interface RefOptions<PM extends Model = any> {
  foreignKey?:  string
  onDelete?:    RefDeleteStrategy<PM>
  include?:     RefInclude
}

export type RefDeleteStrategy<PM extends Model> =
  /** Disallow the deletion. */
  | 'disallow'
  /** Ignore the reference. This will lead to an inconsistent referential integrity, but may be useful for logging purposes. */
  | 'ignore'
  /** Cascade-delete the owning model. */
  | 'cascade'
  /** Fast-delete the owning model. This will not perform additional referential integrity checks. */
  | 'delete'
  /** Unset the reference (set to `null` for single ref, or remove from array in case of an array of refs). */
  | 'unset'
  /** Set to specific value. */
  | {$set: ID}
  /** Custom. */
  | CustomDeleteStrategy<PM>

export type CustomDeleteStrategy<PM extends Model> = ((model: PM, reference: Reference) => boolean | Promise<boolean>)

export const RefDeleteStrategy: {
  isSetStrategy: (strategy: RefDeleteStrategy<any>) => strategy is {$set: ID}
  isCustomStrategy: <PM extends Model>(strategy: RefDeleteStrategy<PM>) => strategy is CustomDeleteStrategy<PM>
} = {
  isSetStrategy: (strategy: RefDeleteStrategy<any>): strategy is {$set: ID} => {
    return isPlainObject(strategy) && '$set' in strategy && ID.isID(strategy.$set)
  },
  isCustomStrategy: <PM extends Model>(strategy: RefDeleteStrategy<PM>): strategy is CustomDeleteStrategy<PM> => {
    return isFunction(strategy)
  }
}

export default function ref<M extends Model, PM extends Model = any>(options: TypeOptions<Ref<M>> & Options<PM> & {required: false}): Type<Ref<M>> & {options: {required: false}}
export default function ref<M extends Model, PM extends Model = any>(options: TypeOptions<Ref<M>> & Options<PM> & {required?: true}): Type<Ref<M>> & {options: {required: true}}
export default function ref<M extends Model, PM extends Model = any>(options: TypeOptions<Ref<M>> & Options<PM>): Type<Ref<M>> {
  return {
    name: 'ref',
    options,

    coerce(value: any): Ref<M> | INVALID {
      const Model = getModelClass(options.model)
      if (Model == null) {
        throw new ReferenceError(`Referenced model \`${options.model}\` does not exist`)
      }

      if (value instanceof Ref) { return value }

      const foreignKey = options.foreignKey || 'id'

      const opts: Options<PM> = options
      const refOptions: RefOptions<PM> = omit(opts, 'model')

      if (ID.isID(value)) {
        return new Ref<M>(Model, value, refOptions)
      } else if (typeof value === 'object' && value != null && ID.isID(value[foreignKey])) {
        return new Ref<M>(Model, value[foreignKey], refOptions)
      } else {
        return INVALID
      }
    },

    serialize(ref: any): any {
      return ref instanceof Ref ? ref.id : ref
    },

    validate(value: any, result: ValidatorResult<any>) {
      if (value instanceof Ref) { return }
      if (ID.isID(value)) { return }

      const foreignKey = options.foreignKey ?? 'id'
      if (typeof value === 'object' && ID.isID(value[foreignKey])) {
        return
      }

      result.addError('invalid_type', 'Expected an ID')
    },
  }
}

export class Ref<M extends Model> {

  constructor(
    public readonly Model: ModelClass<M>,
    public readonly id: IDOf<M>,
    options: RefOptions = {}
  ) {
    this.foreignKey = options.foreignKey ?? 'id'
    this.include    = options.include ?? 'auto'
  }

  public readonly foreignKey: string
  public readonly include:    RefInclude

  public static isRef(arg: any): arg is Ref<any> {
    return arg instanceof Ref
  }

  public equals(other: Ref<M>) {
    if (other.Model !== this.Model) { return false }
    return other.id === this.id
  }

  public [Symbol.toPrimitive]() {
    return this.id
  }

  public toString() {
    return this.id
  }

}

export type RefInclude = 'always' | 'never' | 'auto'