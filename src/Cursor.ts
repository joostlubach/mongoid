import { FindCursor as MongoCursor } from 'mongodb'
import Model from './Model'
import Query from './Query'

export default class Cursor<M extends Model> {

  constructor(
    public readonly query:  Query<M>,
    public readonly cursor: MongoCursor
  ) {}

  private Model = this.query.Model

  public async count(): Promise<number> {
    return await this.query.count()
  }

  public async forEach(iterator: (model: M) => void | Promise<void>): Promise<void> {
    const promises = await this.cursor.map(async document => {
      const model = await this.Model.hydrate(document) as M
      await iterator(model)
    }).toArray()
    return await Promise.all(promises).then(() => undefined)
  }

  public async map<U>(iterator: (model: M) => U | Promise<U>): Promise<Promise<U>[]> {
    return await this.cursor.map(async document => {
      const model = await this.Model.hydrate(document) as M
      return await iterator(model)
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