import { cloneDeep, omit } from 'lodash'
import { CollationOptions } from 'mongodb'
import { sparse } from 'ytil'
import AggregationPipeline from './aggregation/AggregationPipeline'
import Model from './Model'
import { getModelClass, getModelMeta } from './registry'
import { Filter, ModelClass, Sorts } from './typings'

export default class Query<M extends Model> {

  //------
  // Construction & properties

  constructor(
    public readonly Model: ModelClass<M>
  ) {}

  public copy(): Query<M> {
    const copy = new Query<M>(this.Model)
    copy._filters     = cloneDeep(this._filters)
    copy._sorts       = cloneDeep(this._sorts)
    copy._projections = {...this._projections}
    copy._skipCount   = this._skipCount
    copy._limitCount  = this._limitCount
    copy._collation   = this._collation
    return copy
  }

  private _filters:     Filter[] = []

  /**
   * The filters as an array.
   */
  public get filters() {
    return this._filters
  }

  /**
   * Flattens all filters to a single object. Duplicate keys will be overwritten.
   */
  public get flattenedFilters(): Record<string, any> {
    return Object.assign({}, ...this._filters)
  }

  private _projections: Record<string, any> | null = null
  public get projections() { return this._projections }

  private _sorts: Sorts = {}
  public get sorts() { return this._sorts }

  private _skipCount:  number | null = null
  private _limitCount: number | null = null
  public get skipCount()  { return this._skipCount }
  public get limitCount() { return this._limitCount }

  private _collation: CollationOptions | null = null
  public get collation() { return this._collation }

  //------
  // Modification interface

  public filter(...filters: Record<string, any>[]): Query<M> {
    const copy = this.copy()
    copy._filters = filters.map(removeUndefineds)
    return copy
  }

  public removeFilter(name: string) {
    const copy = this.copy()
    copy._filters = this._filters.map(filter => {
      if (name in filter) {
        filter = omit(filter, name)
      }
      if (Object.keys(filter).length === 0) {
        return null
      } else {
        return filter
      }
    }).filter(Boolean) as Record<string, any>[]

    return copy
  }

  public clearFilters() {
    const copy = this.copy()
    copy._filters = []
    return copy
  }

  public none() {
    const copy = this.copy()
    copy._filters = [{id: -1}]
    return copy
  }

  public project(projections: Record<string, any>): Query<M> {
    const copy = this.copy()
    copy._projections = projections
    return copy
  }

  public sort(sorts: Record<string, any>): Query<M> {
    const copy = this.copy()
    copy._sorts = {...copy._sorts, ...sorts}
    return copy
  }

  public clearSorts() {
    const copy = this.copy()
    copy._sorts = {}
    return copy
  }

  public skip(count: number | null): Query<M> {
    const copy = this.copy()
    copy._skipCount = count
    return copy
  }

  public limit(count: number | null): Query<M> {
    const copy = this.copy()
    copy._limitCount = count
    return copy
  }

  public union(other: Query<M>) {
    const merged = new Query(this.Model)
    merged._filters = [{
      $or: [...this._filters, ...merged._filters],
    }]

    merged._sorts = {...this._sorts, ...other._sorts}
    merged._projections =
      this.projections == null && other.projections == null ? {} :
      this.projections == null ? {...other.projections} :
      other.projections == null ? {...this.projections} :
      {...this.projections, ...other.projections}

    const skipCounts = sparse([this.skipCount, other.skipCount])
    merged._skipCount = skipCounts.length > 0 ? Math.min(...skipCounts) : null

    const limitCounts = sparse([this.limitCount, other.limitCount])
    merged._limitCount = limitCounts.length > 0 ? Math.max(...limitCounts) : null

    return merged
  }

  //------
  // Pipeline conversion

  public toPipeline(): AggregationPipeline<M> {
    const pipeline = new AggregationPipeline<M>(this.Model)

    if (this._filters.length > 0) {
      pipeline.match({$and: this._filters})
    }
    pipeline.sort(this._sorts)
    if (this.skipCount != null) {
      pipeline.skip(this.skipCount)
    }
    if (this.limitCount != null) {
      pipeline.limit(this.limitCount)
    }
    return pipeline
  }

  //-------
  // Serialization

  public serialize(): QueryRaw {
    return {
      model:       this.Model.name,
      filters:     this._filters,
      sorts:       this._sorts,
      projections: this._projections,
      skipCount:   this._skipCount,
      limitCount:  this._limitCount,
      collation:   this._collation
    }
  }

  public deserialize(raw: Partial<QueryRaw>) {
    const {
      filters,
      sorts,
      projections,
      skipCount,
      limitCount,
      collation
    } = raw

    if (filters != null) {
      this._filters = filters
    }
    if (sorts != null) {
      this._sorts = sorts
    }
    if (projections !== undefined) {
      this._projections = projections
    }
    if (skipCount != null) {
      this._skipCount = skipCount
    }
    if (limitCount != null) {
      this._limitCount = limitCount
    }
    if (collation != null) {
      this._collation = collation
    }
  }

  public static deserialize(raw: QueryRaw): Query<any> {
    const Model = getModelClass(raw.model)
    const query = new Query(Model)
    query.deserialize(raw)
    return query
  }

}

function removeUndefineds(filters: Record<string, any>) {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

export interface QueryRaw {
  model:        string
  filters:      Filter[]
  sorts:        Sorts
  projections:  Record<string, string | number> | null
  limitCount:   number | null
  skipCount:    number | null
  collation:    CollationOptions | null
}