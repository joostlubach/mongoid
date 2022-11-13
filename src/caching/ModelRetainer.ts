import chalk from 'chalk'
import { Logger } from 'winston'
import { wrapInPromise } from 'ytil'
import config from '../config'
import Model from '../Model'
import Query from '../Query'
import { isRef, Ref } from '../types/ref'
import { IDOf, ModelClass } from '../typings'

export interface ModelRetainerOptions<M extends Model> {
  retain?: boolean

  fetch?:  () => Promise<M | null>
  filter?: (query: Query<M>) => Query<M>

  onFetch?: (model: M) => any
  onFree?:  (model: M) => any

  logger?:        Logger
  notFoundError?: (message: string) => Error
}

/**
 * For memory usage optimization, a way to pass a model reference around, without the need for frequent queries.
 * The retainer has two modes of operations:
 *
 * 1. Simple mode: initialize the retainer and use `.get()` subsequent times. When the retainer is freed from memory, so is
 *    the model reference.
 * 2. ARC mode: initialize the retainer and use `.retain()` and `.release()` as necessary. When the retain count hits 0,
 *    the model is freed. A callback is also invoked, allowing the site holding the retainer to release the retainer itself.
 */
export default class ModelRetainer<M extends Model> {

  constructor(
    public readonly Model: ModelClass<M>,
    public readonly locator: IDOf<M> | M | Ref<M>,
    private readonly options: ModelRetainerOptions<M> = {}
  ) {
    if (locator instanceof Model) {
      this.model = locator as M
      this.id    = this.model.id as IDOf<M>
    } else if (isRef(locator)) {
      if (locator.Model !== Model) {
        throw new Error("Incompatible ref passed in.")
      }
      this.id = locator.id
    } else {
      this.id = locator as IDOf<M>
    }
  }

  public readonly id: IDOf<M>

  //------
  // Retain / release

  private retainCount = 0

  public retain() {
    this.retainCount += 1
    this.options.logger?.debug(chalk`{dim.green Retaining {yellow ${this.Model.name} ${this.id}} {blue (${this.retainCount})}}`)
  }

  public release() {
    this.retainCount -= 1
    this.options.logger?.debug(chalk`{dim.red Released {yellow ${this.Model.name} ${this.id}} {blue (${this.retainCount})}}`)
    if (this.retainCount <= 0) {
      this.retainCount = 0
      this.free()
    }
  }

  //------
  // Model fetching

  private model: M | null = null

  public get isRetained() {
    return this.model != null
  }

  public set(model: M) {
    this.model = model
  }

  public get cached(): M | null {
    return this.model
  }

  public get ref() {
    return new Ref(this.Model, this.id)
  }

  public async get(options?: {retain?: boolean, reload?: boolean, throws?: true}): Promise<M>
  public async get(options: {retain?: boolean, reload?: boolean, throws: false}): Promise<M | null>
  public async get(options?: {retain?: boolean, reload?: boolean, throws?: boolean}): Promise<M | null>
  public async get(options: {retain?: boolean, reload?: boolean, throws?: boolean} = {}): Promise<M | null> {
    // Just fetch the model each time if the retainer is not set to retain.
    if (this.options.retain === false) {
      return await this.fetch(options)
    }

    // If no call to retain has been made, just retain the model once, unless requested not to.
    if (options.retain !== false && this.retainCount === 0) {
      this.retain()
    }

    // Fetch the model if it's not cached. When testing, never cache.
    if (this.model == null || options.reload || !config.cachingEnabled) {
      this.model = await this.fetch(options)
    }

    return this.model
  }

  //------
  // Fetching

  public async fetch(options?: {throws: true}): Promise<M>
  public async fetch(options: {throws: false}): Promise<M | null>
  public async fetch(options?: {throws?: boolean}): Promise<M | null>
  public async fetch(options: {throws?: boolean} = {}): Promise<M | null> {
    const model = await this.getFetchPromise()

    if (model == null && options.throws !== false) {
      const message = `${this.Model.name} with ID ${this.id} not found`
      throw this.options.notFoundError?.(message) ?? new Error(message)
    }

    if (model != null) {
      this.options.onFetch?.(model)
    }
    return model
  }

  private fetchPromise?: Promise<M | null>

  private getFetchPromise() {
    if (this.fetchPromise !== undefined) {
      return this.fetchPromise
    }

    if (this.options.fetch != null) {
      this.fetchPromise = wrapInPromise(this.options.fetch())
    } else {
      let query = this.Model.query()
      if (this.options.filter) {
        query = this.options.filter(query)
      }

      this.fetchPromise = wrapInPromise(query.get(this.id))
    }

    this.fetchPromise.finally(() => {
      delete this.fetchPromise
    })

    return this.fetchPromise
  }

  public replace(model: M) {
    this.model = model
  }

  //------
  // Freeing

  private free() {
    if (this.model != null) {
      this.options.onFree?.(this.model)
      this.options.logger?.debug(chalk`{red Freed {yellow ${this.Model.name} ${this.id}}}`)
    }
    this.model = null
  }

}