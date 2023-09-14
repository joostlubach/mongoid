import { AggregationCursor, FindCursor as MongoCursor } from 'mongodb'
import Model from '../Model'
import ModelBackend from './ModelBackend'

export default class Cursor<M extends Model> {

  constructor(
    public readonly backend: ModelBackend<M>,
    public readonly cursor: MongoCursor | AggregationCursor,
  ) {}

  private get Model() {
    return this.backend?.Model ?? null
  }

  public async *[Symbol.asyncIterator]() {
    for await (const document of this.cursor) {
      yield await this.Model.hydrate(document) as M
    }
  }

  public async map<U>(transform: (model: M) => U | Promise<U>): Promise<Promise<U>[]> {
    return await this.cursor.map(async document => {
      const model = await this.Model.hydrate(document) as M
      return await transform(model)
    }).toArray()
  }

  public hasNext(): Promise<boolean> {
    return this.cursor.hasNext()
  }

  public async next(): Promise<M | null> {
    const document = await this.cursor.next()
    if (document == null) { return null }

    return await this.Model.hydrate(document) as M
  }

  public async toArray(): Promise<M[]> {
    const documents = await this.cursor.toArray()
    const promises  = documents.map(doc => this.Model.hydrate(doc)) as Array<Promise<M>>
    return await Promise.all(promises)
  }

}