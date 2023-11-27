import { isArray, isPlainObject } from 'lodash'
import { objectEntries, objectValues } from 'ytil'
import config from './config'
import { Index } from './typings'

export async function withClientStackTrace<T>(fn: () => PromiseLike<T> | T): Promise<T> {
  if (!config.clientStackTraces) {
    return await fn()
  }

  const clientError = new Error()
  try {
    return await fn()
  } catch (error: any) {
    if (error.name === 'MongoServerError') {
      const clientStack = clientError.stack?.split('\n') ?? []
      error.stack = [`MongoServerError: ${error.message}`, ...clientStack.slice(2)].join('\n')
    }
    throw error
  }
}

export function deepMapKeys(arg: any, fn: (key: string | symbol) => any): any {
  if (isPlainObject(arg)) {
    const result: Record<string, any> = {}
    for (const [attribute, value] of Object.entries(arg)) {
      result[fn(attribute)] = deepMapKeys(value, fn)
    }
    return result
  } else if (isArray(arg)) {
    return arg.map(it => deepMapKeys(it, fn))
  } else {
    return arg
  }
}

export function indexName(index: Index, options: {name?: string}) {
  if (options.name) { return options.name }
  if (objectValues(index).includes('text')) { return 'text' }

  const definedKeys = objectEntries(index).filter(it => it[1] !== undefined).map(it => it[0])
  return definedKeys.map(key => `${key}_${index[key]}`).join('_')
}
