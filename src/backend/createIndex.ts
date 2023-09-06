import { Collection, CreateIndexesOptions } from 'mongodb'

export async function createIndex(collection: Collection, name: string, keys: Record<string, any>, options: CreateIndexesOptions = {}) {
  try {
    await collection.createIndex(keys, options)
  } catch (error: any) {
    if (error.codeName === 'IndexOptionsConflict') {
      // This we can solve by dropping & recreating the index.
      await collection.dropIndex(name)
      await collection.createIndex(keys, options)
    } else {
      throw error
    }
  }
}