/* eslint-disable no-console */
import { isFunction, merge } from 'lodash';
import { ObjectId } from 'mongodb';
const config = {
    idGenerator: () => new ObjectId(),
    timestamps: true,
    cachingEnabled: true,
    logger: {
        debug: console.log,
        info: console.log,
        warn: console.warn,
        error: console.error,
    },
    traceEnabled: false,
    clientStackTraces: process.env.NODE_ENV !== 'production',
};
export default config;
export function configure(cfg) {
    if (isFunction(cfg)) {
        cfg(config);
    }
    else {
        merge(config, cfg);
    }
}
