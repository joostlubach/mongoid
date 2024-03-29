import {
  ChangeStream as mongo_ChangeStream,
  ChangeStreamDeleteDocument,
  ChangeStreamDocument,
  ChangeStreamInsertDocument,
  ChangeStreamOptions as mongo_ChangeStreamOptions,
  ChangeStreamUpdateDocument,
  Db,
} from 'mongodb'

import Model from '../Model'
import ModelChange from '../ModelChange'
import { AggregationPipeline } from '../aggregation'
import { getModelClassForCollection, getModelMeta } from '../registry'
import { ModelClass } from '../typings'
import ModelBackend from './ModelBackend'

export {
  type ChangeStreamDeleteDocument,
  type ChangeStreamDocument,
  type ChangeStreamInsertDocument,
  type ChangeStreamUpdateDocument,
}

export default class ChangeStream<M extends Model> {

  constructor(
    private readonly backend: (Model: ModelClass<M>) => ModelBackend<M>,
    private readonly stream: mongo_ChangeStream,
    private readonly options: ChangeStreamOptions<M> = {},
  ) {
    stream.on('change', this.handleChange.bind(this))

    this.on = this.stream.on.bind(this.stream)
    this.off = this.stream.off.bind(this.stream)
  }

  public readonly on:  typeof mongo_ChangeStream.prototype.on
  public readonly off: typeof mongo_ChangeStream.prototype.off

  // #region Lifecycle

  public async close() {
    await this.stream.close()
  }

  public static watchDb(backend: (Model: ModelClass<any>) => ModelBackend<Model>, db: Db, options: ChangeStreamOptions<Model> = {}) {
    const stages = options.pipeline?.serialize().stages

    return new ChangeStream<Model>(backend, db.watch(stages, ChangeStreamOptions.toMongo(options)))
  }

  public static watchModel<M extends Model>(backend: ModelBackend<M>, options: ChangeStreamOptions<M> = {}) {
    const db = backend.client.db()
    const stages = options.pipeline?.serialize().stages
    const collection = db.collection(getModelMeta(backend.Model).collectionName)
    return new ChangeStream<M>(() => backend, collection.watch(stages, ChangeStreamOptions.toMongo(options)))
  }

  // #endregion

  // #region Listeners

  private listeners = new Set<ChangeListener<any>>()
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
    this.emitRaw(doc)
    this.emitChange(doc)
  }

  private emitRaw(doc: ChangeStreamDocument) {
    for (const listener of this.rawListeners) {
      listener(doc)
    }
  }

  private async emitChange(doc: ChangeStreamDocument) {
    if (this.listeners.size === 0) { return }
    const Model = ChangeStream.getModelForChangeStreamDocument(doc)
    if (Model == null) { return }

    const backend = this.backend(Model as ModelClass<M>)
    const change = await ModelChange.fromMongoChangeStreamDocument<M>(backend, doc)
    for (const listener of this.listeners) {
      listener(change)
    }
  }

  public static getModelForChangeStreamDocument(doc: ChangeStreamDocument) {
    const collectionName = (doc as ChangeStreamInsertDocument).ns?.coll
    if (collectionName == null) { return null }

    return getModelClassForCollection(collectionName, false)
  }

  // #endregion

}

export interface ChangeStreamOptions<M extends Model> extends Omit<mongo_ChangeStreamOptions, 'fullDocument' | 'fullDocumentBeforeChange'> {
  full?:     boolean
  pipeline?: AggregationPipeline<M>
}

const ChangeStreamOptions: {
  toMongo(options: ChangeStreamOptions<any>): mongo_ChangeStreamOptions
} = {
  toMongo(options: ChangeStreamOptions<any>): mongo_ChangeStreamOptions {
    const {full, ...rest} = options

    return {
      fullDocument:             full ? 'updateLookup' : undefined,
      fullDocumentBeforeChange: full ? 'whenAvailable' : undefined,
      ...rest,
    }
  },
}

export type ChangeListener<M extends Model> = (change: ModelChange<M>) => void
export type RawChangeListener = (change: ChangeStreamDocument) => void

export interface ChangeListenerOptions {
  raw?: boolean
}
