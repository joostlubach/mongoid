import chalk from 'chalk'
import { Collection, CreateIndexesOptions } from 'mongodb'
import config from '../config'
import { indexName, withClientStackTrace } from '../util'

export async function createIndex(collection: Collection, keys: Record<string, any>, options: CreateIndexesOptions = {}) {
  const name = indexName(keys, options)
  if (options.name === undefined) {
    options.name = name
  }

  await withClientStackTrace(async () => {
    try {
      config.logger.debug(chalk`Creating index: {yellow ${collection.collectionName}.${name}}`)
      await collection.createIndex(keys, options)
    } catch (error: any) {
      if (error.codeName === 'IndexOptionsConflict') {
        config.logger.info(chalk`Re-creating index: {yellow ${collection.collectionName}.${name}}`)

        // This we can solve by dropping & recreating the index.
        await collection.dropIndex(name)
        await collection.createIndex(keys, options)
      } else {
        throw error
      }
    }
  })
}