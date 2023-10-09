import { Collection, Db, MongoClient } from 'mongodb'

export function mockClient(): MongoClient {
  return {
    db: () => mockDB(),
  } as MongoClient

}

export function mockDB(): Db {
  return {
    collection: (name: string) => mockCollection(name)
  } as Db
}

export function mockCollection(name: string): Collection {
  return new MockCollection(name) as any as Collection
}

export class MockCollection {

  constructor(name: string) {
    this.collectionName = name
  }

  public readonly dbName: string = 'TEST'
  public readonly collectionName: string

  public find(...args: any[]) {
    return new MockCursor()
  }
  public findOne(...args: any[]) {
    return null
  }

  public insertOne(...args: any[]) {}
  public insertMany(...args: any[]) {}
  public updateOne(...args: any[]) {}
  public updateMany(...args: any[]) {}
  public deleteOne(...args: any[]) {}
  public deleteMany(...args: any[]) {}
  public countDocuments(...args: any[]) { return 0 }
  public aggregate(...args: any[]) { return new MockCursor() }

}

export class MockCursor {

  public project(...args: any[]) { return this }
  public sort(...args: any[]) { return this }

  public toArray() { return Promise.resolve([]) }

}