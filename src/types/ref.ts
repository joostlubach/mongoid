import Model from '../Model'
import Query from '../Query'
import models from '../models'
import {ID} from '../typings'
import {isID} from '../ID'
import {ValidationContext, Type, TypeOptions, INVALID} from '@joostlubach/validator'
import {omit} from 'lodash'

export interface Options {
  model:       string
  foreignKey?: string
}

export interface RefModel<M extends Model> {
  query(): Query<M>
}

type RefOptions = Omit<Options, 'model'>

function ref<M extends Model>(options: TypeOptions<Ref<M>> & Options & {required: false}): Type<Ref<M>> & {options: {required: false}}
function ref<M extends Model>(options: TypeOptions<Ref<M>> & Options & {required?: true}): Type<Ref<M>> & {options: {required: true}}
function ref<M extends Model>(options: TypeOptions<Ref<M>> & Options): Type<Ref<M>> {
  return {
    options,

    cast(value: any): Ref<M> | INVALID {
      const model = models[options.model] as any as RefModel<M>
      if (model == null) {
        throw new ReferenceError(`Referenced model \`${options.model}\` does not exist`)
      }

      if (value instanceof Ref) { return value }

      const foreignKey = options.foreignKey || 'id'
      if (isID(value)) {
        return new Ref(model, value, omit(options, 'model'))
      } else if (typeof value === 'object' && value != null && isID(value[foreignKey])) {
        return new Ref(model, value[foreignKey], omit(options, 'model'))
      } else {
        return INVALID
      }
    },

    serialize(ref: any): any {
      return ref instanceof Ref ? ref.id : ref
    },

    async validate(value: any, context: ValidationContext) {
      if (value instanceof Ref) { return }
      if (isID(value)) { return }

      const foreignKey = options.foreignKey || 'id'
      if (typeof value === 'object' && isID(value[foreignKey])) {
        return
      }

      context.addError('invalid_type', 'Expected an ID')
    }
  }
}

export class Ref<M> {

  constructor(Model: RefModel<any>, id: ID, options: RefOptions = {}) {
    this.Model = Model
    this.id = id
    this.foreignKey = options.foreignKey || 'id'

    Object.defineProperty(this, 'cache', {enumerable: false})
  }

  readonly Model:      RefModel<any>
  readonly id:         ID
  readonly foreignKey: string

  cache: M | null | undefined = undefined

  async get(): Promise<M | null> {
    if (this.cache === undefined) {
      const query = this.Model.query()
      if (this.foreignKey === 'id') {
        this.cache = await query.get(this.id)
      } else {
        this.cache = await query.filter({[this.foreignKey]: this.id}).findOne()
      }
    }

    return this.cache as M | null
  }

  static async getAll<M extends Model>(refs: Array<Ref<M>>): Promise<M[]> {
    if (refs.length === 0) { return [] }

    const foreignKey = refs[0].foreignKey
    const ids        = refs.map(ref => ref.id)

    const query = refs[0].Model.query()
    return await query.filter({[foreignKey]: {$in: ids}}).all()
  }

  static async getMap<M extends Model>(refs: Array<Ref<M>>): Promise<Map<ID, M>> {
    const map = new Map()
    const all = await this.getAll(refs)
    for (const item of all) {
      map.set(item.id, item)
    }
    return map
  }

  [Symbol.toPrimitive]() {
    return this.id
  }

  toString() {
    return this.id
  }

}

export default ref