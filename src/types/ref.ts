import { isFunction, omit } from 'lodash'
import { INVALID, OptionalType, RequiredType, Type, TypeOptions, ValidatorResult } from 'validator'
import { isPlainObject } from 'ytil'
import { Reference } from '../backend/ReferentialIntegrity'
import Model from '../Model'
import { getModelClass } from '../registry'
import { ID, IDOf, ModelClass } from '../typings'

export interface RefOptions<TRef extends Model, TParent extends Model> extends TypeOptions<Ref<TRef, TParent>> {
  /** The name of the model for the ref */
  model: string

  /** The foreign key to use (defaults to `id`.) */
  foreignKey?: string

  /**
   * The strategy to use when the referenced object is deleted.
   *
   * Default: `'unset'`.
   */
  onDelete?: RefDeleteStrategy<TParent>

  /**
   * Set to true to always include this ref when the containing model is loaded.
   */
  include?: RefInclude
}

export type RefDeleteStrategy<TParent extends Model> =
  /** Unset the reference (set to `null` for single ref, or remove from array in case of an array of refs). This is the default setting. */
  | 'unset'
  /** Disallow the deletion. */
  | 'disallow'
  /** Ignore the reference. This will lead to an inconsistent referential integrity, but may be useful for logging purposes. */
  | 'ignore'
  /** Cascade-delete the owning model. */
  | 'cascade'
  /** Fast-delete the owning model. This will not perform additional referential integrity checks. */
  | 'delete'
  /** Set to specific value. */
  | {$set: ID}
  /** Custom. */
  | CustomDeleteStrategy<TParent>

export type CustomDeleteStrategy<TParent extends Model> = ((model: TParent, reference: Reference) => boolean | Promise<boolean>)

export const RefDeleteStrategy: {
  isSetStrategy: (strategy: RefDeleteStrategy<any>) => strategy is {$set: ID}
  isCustomStrategy: <TParent extends Model>(strategy: RefDeleteStrategy<TParent>) => strategy is CustomDeleteStrategy<TParent>
} = {
  isSetStrategy: (strategy: RefDeleteStrategy<any>): strategy is {$set: ID} => {
    return isPlainObject(strategy) && '$set' in strategy && ID.isID(strategy.$set)
  },
  isCustomStrategy: <TParent extends Model>(strategy: RefDeleteStrategy<TParent>): strategy is CustomDeleteStrategy<TParent> => {
    return isFunction(strategy)
  }
}

export default function ref<TRef extends Model, TParent extends Model = any>(options: RefOptions<TRef, TParent> & {required: false}): OptionalType<Ref<TRef, TParent>, RefOptions<TRef, TParent>>
export default function ref<TRef extends Model, TParent extends Model = any>(options: RefOptions<TRef, TParent>): RequiredType<Ref<TRef, TParent>, RefOptions<TRef, TParent>>
export default function ref(options: RefOptions<any, any>): Type<any, any> {
  return {
    name: 'ref',
    options,

    coerce(value: any): Ref<any, any> | INVALID {
      const Model = getModelClass(options.model)
      if (Model == null) {
        throw new ReferenceError(`Referenced model \`${options.model}\` does not exist`)
      }

      if (value instanceof Ref) { return value }

      const foreignKey = options.foreignKey || 'id'

      if (ID.isID(value)) {
        return new Ref(Model, value, omit(options, 'model'))
      } else if (typeof value === 'object' && value != null && ID.isID(value[foreignKey])) {
        return new Ref(Model, value[foreignKey], omit(options, 'model'))
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

export class Ref<TRef extends Model, TParent extends Model = Model> {

  constructor(
    public readonly Model: ModelClass<TRef>,
    public readonly id: IDOf<TRef>,
    options: Omit<RefOptions<TRef, TParent>, 'model'> = {}
  ) {
    this.foreignKey = options.foreignKey ?? 'id'
    this.include    = options.include ?? 'auto'
  }

  public readonly foreignKey: string
  public readonly include:    RefInclude

  public static isRef<TRef extends Model, TParent extends Model>(arg: any): arg is Ref<TRef, TParent> {
    return arg instanceof Ref
  }

  public equals(other: Ref<TRef, TParent>) {
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