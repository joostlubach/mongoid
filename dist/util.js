import { isArray, isPlainObject } from 'lodash';
import config from './config';
export async function withClientStackTrace(fn) {
    if (!config.clientStackTraces) {
        return await fn();
    }
    const clientError = new Error();
    try {
        return await fn();
    }
    catch (error) {
        if (error.name === 'MongoServerError') {
            const clientStack = clientError.stack?.split('\n') ?? [];
            error.stack = [`MongoServerError: ${error.message}`, ...clientStack.slice(2)].join('\n');
        }
        throw error;
    }
}
export function deepMapKeys(arg, fn) {
    if (isPlainObject(arg)) {
        const result = {};
        for (const [attribute, value] of Object.entries(arg)) {
            result[fn(attribute)] = deepMapKeys(value, fn);
        }
        return result;
    }
    else if (isArray(arg)) {
        return arg.map(it => deepMapKeys(it, fn));
    }
    else {
        return arg;
    }
}
