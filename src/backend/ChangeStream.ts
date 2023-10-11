import { isFunction } from 'lodash'
import {
  ChangeStream as mongo_ChangeStream,
  ChangeStreamDeleteDocument,
  ChangeStreamDocument,
  ChangeStreamInsertDocument,
  ChangeStreamOptions,
  ChangeStreamUpdateDocument,
  Collection,
  Db,
} from 'mongodb'
import { AggregationPipeline } from '../aggregation'
import { ModelBackend } from '../backend'
import Model from '../Model'
import ModelChange from '../ModelChange'
import { getModelMeta } from '../registry'
import { ModelClass } from '../typings'

export {
  type ChangeStreamDeleteDocument,
  type ChangeStreamDocument,
  type ChangeStreamInsertDocument,
  type ChangeStreamOptions,
  type ChangeStreamUpdateDocument,
}

export default class ChangeStream<M extends Model> {

  constructor(
    private readonly stream: mongo_ChangeStream,
    private readonly options: ChangeStreamOptions = {}
  ) {
    stream.on('change', this.handleChange.bind(this))
  }

  // #region Lifecycle

  public close() {
    this.stream.close()
  }

  public static watchDb(db: Db, pipeline?: AggregationPipeline<Model>, options: ChangeStreamOptions = {}) {
    const stages = pipeline?.serialize().stages
    return new ChangeStream<Model>(db.watch(stages, options))
  }

  public static watchModel<M extends Model>(db: Db, Model: ModelClass<M>, pipeline?: AggregationPipeline<M>, options: ChangeStreamOptions = {}) {
    const stages = pipeline?.serialize().stages
    const collection = db.collection(getModelMeta(Model).collectionName)
    return new ChangeStream<M>(collection.watch(stages, options))
  }

  // #endregion

  // #region Listeners

  private listeners    = new Set<ChangeListener<any>>()
  private rawListeners = new Set<RawChangeListener>()

  public addListener(listener: RawChangeListener, options?: ChangeListenerOptions & {raw: true}): void
  public addListener<M extends Model>(listener: ChangeListener<M>, options?: ChangeListenerOptions): void
  public addListener(listener: ChangeListener<any> | RawChangeListener, options: ChangeListenerOptions = {}) {
    if (options.raw) {
      this.rawListeners.add(listener as RawChangeListener)
    } else {
      this.listeners.add(listener as ChangeListener<any>)
    }
  }

  private handleChange(doc: ChangeStreamDocument) {
    for (const listener of this.rawListeners) {
      listener(doc)
    }
  }

  // #endregion

}

export type ChangeListener<M extends Model> = (change: ModelChange<M>) => void
export type RawChangeListener = (change: ChangeStreamDocument) => void

export interface ChangeListenerOptions {
  raw?: boolean
}