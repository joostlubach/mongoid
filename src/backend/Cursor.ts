import { AggregationCursor, FindCursor as mongo_Cursor } from 'mongodb'
import Model from '../Model'
import ModelBackend from './ModelBackend'

export default class Cursor<M extends Model> {

  constructor(
    public readonly backend: ModelBackend<M>,
    public readonly cursor: mongo_Cursor | AggregationCursor,
  ) {}

  public async * [Symbol.asyncIterator]() {
    for await (const document of this.cursor) {
      yield await this.backend.hydrate(document) as M
    }
  }

  public async map<U>(transform: (model: M) => U | Promise<U>): Promise<Promise<U>[]> {
    return await this.cursor.map(async document => {
      const model = await this.backend.hydrate(document) as M
      return await transform(model)
    }).toArray()
  }

  public hasNext(): Promise<boolean> {
    return this.cursor.hasNext()
  }

  public async next(): Promise<M | null> {
    const document = await this.cursor.next()
    if (document == null) { return null }

    return await this.backend.hydrate(document) as M
  }

  public async toArray(): Promise<M[]> {
    const documents = await this.cursor.toArray()
    const promises = documents.map(doc => this.backend.hydrate(doc))
    return await Promise.all(promises)
  }

}
