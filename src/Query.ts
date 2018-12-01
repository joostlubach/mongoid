import Model from './Model'
import {Collection, Cursor as MongoCursor, UpdateWriteOpResult} from 'mongodb'
import {emitDelete} from './changes'
import {ID, ModelClass} from './typings'
import Cursor from './Cursor'
import {pick, omit, cloneDeep} from 'lodash'

export default class Query<M extends Model> {

  //------
  // Construction & properties

  constructor(readonly Model: ModelClass<M>) {
    Model.initialize()
  }

  copy(): Query<M> {
    const copy = new Query<M>(this.Model)
    copy.filters    = cloneDeep(this.filters)
    copy.sorts      = cloneDeep(this.sorts)
    copy.skipCount  = this.skipCount
    copy.limitCount = this.limitCount
    return copy
  }

  get collection(): Collection {
    return this.Model.meta.collection
  }

  filters:     AnyObject[] = []
  projections: AnyObject = {}
  sorts:       AnyObject = {}
  skipCount:   number | null = null
  limitCount:  number | null = null

  /**
   * Gets all filters as a `{$and: [...]}` compound. If there are duplicate keys, e.g. two `$or`-keys, this will
   * make sure all filters end up in the Mongo DB query.
   */
  get compoundFilters(): AnyObject {
    if (this.filters.length === 0) { return {} }
    return {$and: this.filters}
  }

  /**
   * Flattens all filters to a single object. Duplicate keys will be overwritten.
   */
  get flattenedFilters(): AnyObject {
    return Object.assign({}, ...this.filters)
  }

  //------
  // Modification interface

  filter(...filters: AnyObject[]): Query<M> {
    const copy = this.copy()

    for (const filter of filters) {
      const {id, ...rest} = filter
      if (id != null) {
        copy.filters.push({_id: id})
      }
      copy.filters.push(rest)
    }
    return copy
  }

  removeFilter(name: string) {
    const copy = this.copy()
    copy.filters = this.filters.map(filter => {
      if (name in filter) {
        filter = omit(filter, name)
      }
      if (Object.keys(filter).length === 0) {
        return null
      } else {
        return filter
      }
    }).filter(Boolean) as AnyObject[]

    return copy
  }

  project(projections: AnyObject): Query<M> {
    const {id, ...rest} = projections
    const copy = this.copy()
    Object.assign(copy.projections, {...rest, ...(id == null ? null : {_id: id})})
    return copy
  }

  sort(sorts: AnyObject): Query<M> {
    const {id, ...rest} = sorts
    const copy = this.copy()
    Object.assign(copy.sorts, {...rest, ...(id == null ? null : {_id: id})})
    return copy
  }

  skip(count: number | null): Query<M> {
    const copy = this.copy()
    copy.skipCount = count
    return copy
  }

  limit(count: number | null): Query<M> {
    const copy = this.copy()
    copy.limitCount = count
    return copy
  }

  //------
  // Data retrieval

  private countCache: number | null = null

  async count(): Promise<number> {
    if (this.countCache == null) {
      this.countCache = await this.limit(null).run().count()
    }
    return this.countCache
  }

  async get(id: ID): Promise<M | null> {
    return await this.filter({id}).findOne()
  }

  async all(): Promise<M[]> {
    return await this.run().toArray()
  }

  async first(): Promise<M | null> {
    const documents = await this.limit(1).all()
    return documents[0] || null
  }

  find(): Cursor<M> {
    return this.run()
  }

  async findOne(): Promise<M | null> {
    const document = await this.collection.findOne(this.compoundFilters)
    if (document == null) { return null }

    return await this.Model.hydrate(document) as M | null
  }

  async forEach(iterator: (model: M) => any) {
    await this.run().forEach(iterator)
  }

  async pluck(property: string): Promise<any[]>
  async pluck(...properties: string[]): Promise<{[property: string]: any}[]>
  async pluck(...properties: string[]) {
    const projection: AnyObject = {}
    for (let property of properties) {
      if (property === 'id') { property = '_id' }
      projection[property] = 1
    }

    let rows = await this.raw(projection).toArray()
    rows = rows.map(row => ({id: row._id, ...omit(row, '_id')}))

    if (properties.length === 1) {
      return rows.map(row => row[properties[0]])
    } else {
      return rows.map(row => pick(row, properties))
    }
  }

  /**
   * Runs this query and returns a cursor returning model instances.
   */
  run(): Cursor<M> {
    return new Cursor(this.Model, this.raw())
  }

  /**
   * Explains this query (calls `.explain()` on the underlying cursor).
   */
  explain() {
    return this.raw().explain()
  }

  /**
   * Runs the query and retrieves a raw MongoDB cursor.
   */
  raw(projection: Object = this.projections): MongoCursor {
    let cursor = this.collection
      .find(this.compoundFilters, projection)
      .sort(this.sorts)

    if (this.skipCount != null) {
      cursor = cursor.skip(this.skipCount)
    }
    if (this.limitCount != null) {
      cursor = cursor.limit(this.limitCount)
    }

    return cursor
  }

  //------
  // Updates

  /**
   * Updates matching documents with new values.
   *
   * @param updates The updates.
   */
  async update(updates: AnyObject): Promise<UpdateWriteOpResult> {
    return await this.collection.updateMany(this.compoundFilters, updates)
  }

  /**
   * Deletes matching documents.
   */
  async delete(triggerChange: boolean = true) {
    if (triggerChange) {
      this.filter(this.compoundFilters).forEach(model => {
        emitDelete(model)
      })
    }

    return await this.collection.deleteMany(this.compoundFilters)
  }

}