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

