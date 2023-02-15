import { isFunction, isPlainObject, omit, uniq } from 'lodash'
import { INVALID, Type, TypeOptions, ValidatorResult } from 'validator'
import { isID } from '../ID'
import Model from '../Model'
import models from '../models'
import Query from '../Query'
import { ID, IDOf } from '../typings'

import type { Reference } from '../ReferentialIntegrity'

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
  include?: RefInclude
}

export interface RefModel<M extends Model = any> {
  name:    string
  query(): Query<M>
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

function ref<M extends Model, PM extends Model = any>(options: TypeOptions<Ref<M>> & Options<PM> & {required: false}): Type<Ref<M>> & {options: {required: false}}
function ref<M extends Model, PM extends Model = any>(options: TypeOptions<Ref<M>> & Options<PM> & {required?: true}): Type<Ref<M>> & {options: {required: true}}
function ref<M extends Model, PM extends Model = any>(options: TypeOptions<Ref<M>> & Options<PM>): Type<Ref<M>> {
  return {
    name: 'ref',
    options,

    coerce(value: any): Ref<M> | INVALID {
      const model = models[options.model] as any as RefModel<M>
      if (model == null) {
        throw new ReferenceError(`Referenced model \`${options.model}\` does not exist`)
      }

      if (value instanceof Ref) { return value }

      const foreignKey = options.foreignKey || 'id'

      const opts: Options<PM> = options
      const refOptions: RefOptions<PM> = omit(opts, 'model')

      if (isID(value)) {
        return new Ref<M>(model, value, refOptions)
      } else if (typeof value === 'object' && value != null && isID(value[foreignKey])) {
        return new Ref<M>(model, value[foreignKey], refOptions)
      } else {
        return INVALID
      }
    },

    serialize(ref: any): any {
      return ref instanceof Ref ? ref.id : ref
    },

    validate(value: any, result: ValidatorResult<any>) {
      if (value instanceof Ref) { return }
      if (isID(value)) { return }

      const foreignKey = options.foreignKey ?? 'id'
      if (typeof value === 'object' && isID(value[foreignKey])) {
        return
      }

      result.addError('invalid_type', 'Expected an ID')
    },
  }
}

export class Ref<M extends Model = any> {

  constructor(Model: RefModel<any>, id: IDOf<M>, options: RefOptions = {}) {
    this.Model      = Model
    this.id         = id
    this.foreignKey = options.foreignKey ?? 'id'
    this.include    = options.include ?? 'auto'

    Object.defineProperty(this, 'cache', {enumerable: false})
  }

  public readonly Model:      RefModel<any>
  public readonly id:         IDOf<M>
  public readonly foreignKey: string
  public readonly include:    RefInclude

  protected cache: M | null | undefined = undefined

  public async get(): Promise<M | null> {
    return this.cache ??= await this.fetch()
  }

  public getCached(): M | null | undefined {
    return this.cache
  }

  public async fetch(): Promise<M | null> {
    const query = this.Model.query()
    if (this.foreignKey === 'id') {
      this.cache = await query.get(this.id)
    } else {
      this.cache = await query.findOne({[this.foreignKey]: this.id})
    }

    return this.cache as M | null
  }

  public async reload() {
    await this.cache?.reload()
  }

  public static async getAll<M extends Model>(refs: Array<Ref<M>>, cache: boolean = true): Promise<M[]> {
    if (refs.length === 0) { return [] }

    const foreignKey = refs[0].foreignKey
    const ids        = uniq(refs.map(ref => ref.id))

    const query  = refs[0].Model.query()
    const models = await query.filter({[foreignKey]: {$in: ids}}).all()

    if (cache) {
      for (const ref of refs) {
        ref.cache = models.find(model => model.id === ref.id) ?? null
      }
    }

    return models
  }

  public static async getMap<M extends Model>(refs: Array<Ref<M>>): Promise<Map<ID, M>> {
    const map = new Map()
    const all = await this.getAll(refs)
    for (const item of all) {
      map.set(item.id, item)
    }
    return map
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
export type CachedRef<M extends Model> = Ref<M> & {getCached: () => M | null}

export function isRef<M extends Model>(arg: any): arg is Ref<M> {
  return arg instanceof Ref
}

export default ref

export function isSetStrategy(strategy: RefDeleteStrategy<any>): strategy is {$set: ID} {
  return isPlainObject(strategy)
}

export function isCustomStrategy<PM extends Model>(strategy: RefDeleteStrategy<PM>): strategy is CustomDeleteStrategy<PM> {
  return isFunction(strategy)
}
