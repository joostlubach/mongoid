import { cloneDeep, mapValues, omit } from 'lodash'
import { CollationOptions } from 'mongodb'
import { sparse } from 'ytil'

import FilterMatcher from './FilterMatcher'
import Model from './Model'
import AggregationPipeline from './aggregation/AggregationPipeline'
import { getModelClass, getModelMeta } from './registry'
import { PolymorphicRef } from './types'
import { Ref } from './types/ref'
import { Filter, ModelClass, Sorts } from './typings'

export default class Query<M extends Model> implements AsQuery<M> {

  constructor(
    public readonly Model: ModelClass<M>,
  ) {}

  // #region Properties

  public asQuery(): Query<M> {
    return this
  }

  public copy(): Query<M> {
    const copy = new Query<M>(this.Model)
    copy._filters = cloneDeep(this._filters)
    copy._sorts = cloneDeep(this._sorts)
    copy._projections = this._projections == null ? null : {...this._projections}
    copy._skipCount = this._skipCount
    copy._limitCount = this._limitCount
    copy._collation = this._collation
    return copy
  }

  private _filters: Filter[] = []

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
  public get skipCount() { return this._skipCount }
  public get limitCount() { return this._limitCount }

  private _collation: CollationOptions | null = null
  public get collation() { return this._collation }

  // #endregion

  // #region Modification interface

  public filter(...filters: Record<string, any>[]): Query<M> {
    const copy = this.copy()
    copy._filters.push(...filters.map(removeUndefineds))
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
      this.projections == null && other.projections == null
        ? {}
        : this.projections == null
          ? {...other.projections}
          : other.projections == null
            ? {...this.projections}
            : {...this.projections, ...other.projections}

    const skipCounts = sparse([this.skipCount, other.skipCount])
    merged._skipCount = skipCounts.length > 0 ? Math.min(...skipCounts) : null

    const limitCounts = sparse([this.limitCount, other.limitCount])
    merged._limitCount = limitCounts.length > 0 ? Math.max(...limitCounts) : null

    return merged
  }

  // #endregion

  // #region Pipeline conversion

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

  // #endregion

  // #region Matching

  public matches(model: M): boolean {
    for (const filters of this.filters) {
      const matcher = new FilterMatcher(filters)
      if (!matcher.matches(model)) { return false }
    }

    return true
  }

  // #endregion

  // #region Serialization

  public serialize(): QueryRaw {
    return {
      model:       this.Model.name,
      filters:     this._filters.map(it => this.serializeFilter(it)),
      sorts:       this._sorts,
      projections: this._projections,
      skipCount:   this._skipCount,
      limitCount:  this._limitCount,
      collation:   this._collation,
    }
  }

  private serializeFilter(filter: Record<string, any>) {
    const meta = getModelMeta(this.Model)

    const isPolymorphicRefField = (name: string) => {
      const field = meta.schemas[0][name]
      return field?.options.type === 'polymorphicRef'
    }

    return mapValues(filter, (val, name) => {
      // Typically, model instances or Ref instances may be used to filter refs.
      if (val instanceof Ref || val instanceof PolymorphicRef) {
        return val.serialize()
      } else if (val instanceof Model) {
        if (isPolymorphicRefField(name)) {
          return {
            model: val.ModelClass.name,
            id:    val.id,
          }
        } else {
          return val.id
        }
      } else {
        return val
      }

    })
  }

  public deserialize(raw: Partial<QueryRaw>) {
    const {
      filters,
      sorts,
      projections,
      skipCount,
      limitCount,
      collation,
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

  // #endregion

}

export class Scope<M extends Model> implements AsQuery<M> {

  constructor(
    public readonly Model: ModelClass<M>,
    private readonly modifier: (query: Query<M>) => Query<M>,
  ) {}

  public asQuery() {
    return this.apply(this.Model.query())
  }

  public apply(query: Query<M>): Query<M> {
    return this.modifier(query)
  }

}

export interface AsQuery<M extends Model> {
  asQuery(): Query<M>
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
  model:       string
  filters:     Filter[]
  sorts:       Sorts
  projections: Record<string, string | number> | null
  limitCount:  number | null
  skipCount:   number | null
  collation:   CollationOptions | null
}
