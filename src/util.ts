import { isArray, isPlainObject } from 'lodash'
import config from './config'

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

export function indexName(keys: {[key: string]: number | 'text'}, options: {name?: string}) {
  if (options.name) { return options.name }
  if (Object.values(keys).includes('text')) { return 'text' }

  return Object.keys(keys).map(key => `${key}_${keys[key]}`).join('_')
}
