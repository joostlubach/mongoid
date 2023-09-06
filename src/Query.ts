import { cloneDeep, omit } from 'lodash'
import { CollationOptions } from 'mongodb'
import { sparse } from 'ytil'
import AggregationPipeline from './aggregation/AggregationPipeline'
import Model from './Model'
import { Filter, ModelClass, Sort } from './typings'

export interface QueryOptions {
  collection?: string
}

export default class Query<M extends Model> {

  //------
  // Construction & properties

  constructor(
    public readonly Model: ModelClass<M>,
    public readonly options: QueryOptions = {}
  ) {}

  public copy(): Query<M> {
    const copy = new Query<M>(this.Model, {...this.options})
    copy.filters    = cloneDeep(this.filters)
    copy.sorts      = cloneDeep(this.sorts)
    copy.skipCount  = this.skipCount
    copy.limitCount = this.limitCount
    copy.collation  = this.collation
    return copy
  }

  public switchCollection(collectionName: string) {
    const copy = this.copy()
    copy.options.collection = collectionName
    return copy
  }

  public filters:     Filter[] = []
  public projections: Record<string, any> | null = null
  public sorts:       Sort[] = []
  public skipCount:   number | null = null
  public limitCount:  number | null = null
  public collation:   CollationOptions | null = null

  /**
   * Gets all filters as a `{$and: [...]}` compound. If there are duplicate keys, e.g. two `$or`-keys, this will
   * make sure all filters end up in the Mongo DB query.
   */
  public get compoundFilters(): Record<string, any> {
    if (this.filters.length === 0) { return {} }
    return {$and: this.filters}
  }

  /**
   * Flattens all filters to a single object. Duplicate keys will be overwritten.
   */
  public get flattenedFilters(): Record<string, any> {
    return Object.assign({}, ...this.filters)
  }

  //------
  // Modification interface

  public filter(...filters: Record<string, any>[]): Query<M> {
    const copy = this.copy()

    for (const filter of filters) {
      const {id, ...rest} = removeUndefineds(filter)
      if (id != null) {
        copy.filters.push({_id: id})
      }
      if (Object.keys(rest).length > 0) {
        copy.filters.push(rest)
      }
    }
    return copy
  }

  public removeFilter(name: string) {
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
    }).filter(Boolean) as Record<string, any>[]

    return copy
  }

  public clearFilters() {
    const copy = this.copy()
    copy.filters = []
    return copy
  }

  public none() {
    const copy = this.copy()
    copy.filters = [{id: -1}]
    return copy
  }

  public project(projections: Record<string, any>): Query<M> {
    const copy = this.copy()
    copy.projections = projections
    return copy
  }

  public sort(sorts: Record<string, any>): Query<M> {
    const {id, ...rest} = sorts
    const copy = this.copy()
    copy.sorts.unshift({...rest, ...(id == null ? null : {_id: id})})
    return copy
  }

  public clearSorts() {
    const copy = this.copy()
    copy.sorts = []
    return copy
  }

  public skip(count: number | null): Query<M> {
    const copy = this.copy()
    copy.skipCount = count
    return copy
  }

  public limit(count: number | null): Query<M> {
    const copy = this.copy()
    copy.limitCount = count
    return copy
  }

  public union(other: Query<M>) {
    const merged = new Query(this.Model)
    merged.filters = [{
      $or: [...this.filters, ...merged.filters],
    }]

    merged.sorts = [...this.sorts, ...other.sorts]
    merged.projections =
      this.projections == null && other.projections == null ? {} :
      this.projections == null ? {...other.projections} :
      other.projections == null ? {...this.projections} :
      {...this.projections, ...other.projections}

    const skipCounts = sparse([this.skipCount, other.skipCount])
    merged.skipCount = skipCounts.length > 0 ? Math.min(...skipCounts) : null

    const limitCounts = sparse([this.limitCount, other.limitCount])
    merged.limitCount = limitCounts.length > 0 ? Math.max(...limitCounts) : null

    return merged
  }

  //------
  // Pipeline conversion

  public toPipeline(): AggregationPipeline<M> {
    const pipeline = new AggregationPipeline<M>(this.Model)

    if (Object.keys(this.compoundFilters).length > 0) {
      pipeline.match(this.compoundFilters)
    }
    for (const sort of this.sorts) {
      pipeline.sort(sort)
    }
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
      filters:     this.filters,
      sorts:       this.sorts,
      projections: this.projections,
      skipCount:   this.skipCount,
      limitCount:  this.limitCount,
      collation:   this.collation
    }
  }

  public static deserialize<M extends Model = any>(Model: ModelClass<M>, raw: Record<string, any>): Query<M> {
    const query = new Query(Model)
    Object.assign(query, raw)
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
  filters:      Filter[]
  sorts:        Sort[]
  projections:  Record<string, string | number> | null
  limitCount:   number | null
  skipCount:    number | null
  collation:    CollationOptions | null
}