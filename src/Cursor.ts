import Model from './Model'
import {ModelClass} from './typings'
import {Cursor as MongoCursor} from 'mongodb'

export default class Cursor<M extends Model> {

  constructor(
    readonly Model:  ModelClass<M>,
    readonly cursor: MongoCursor
  ) {}

  async count(): Promise<number> {
    return this.cursor.count()
  }

  forEach(iterator: (model: M) => void | Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const next = async (error: Error, document: Object) => {
        if (error != null) {
          reject(error)
        } else if (document == null) {
          resolve()
        } else {
          try {
            const model = await this.Model.hydrate(document) as M
            await iterator(model)
            this.cursor.next(next)
          } catch (error) {
            reject(error)
          }
        }
      }
      this.cursor.next(next)
    })
  }

  hasNext(): Promise<boolean> {
    return this.cursor.hasNext()
  }

  async next(): Promise<M | null> {
    const document = await this.cursor.next()
    if (document == null) { return null }

    return this.Model.hydrate(document) as Promise<M | null>
  }

  async toArray(): Promise<M[]> {
    const documents = await this.cursor.toArray()
    const promises  = documents.map(doc => this.Model.hydrate(doc) as Promise<M>)
    return Promise.all(promises)
  }

}