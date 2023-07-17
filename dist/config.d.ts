import { IDGenerator } from './typings';
export interface Config {
    /** A function that generates an ID for the model when it is created. */
    idGenerator: IDGenerator;
    /** Whether to manage timestamp fields `createdAt` and `updatedAt`. */
    timestamps: boolean;
    /** Whether ModelRetainer enables caching by default. Turn off for unit testing. */
    cachingEnabled: boolean;
    /** A logger to use. */
    logger: Logger;
    /** Whether to log (level=debug) all queries and pipelines. */
    traceEnabled: boolean;
    /** If set to true, all MongoErrors will receive client stack traces. */
    clientStackTraces: boolean;
}
export interface Logger {
    debug: (message: string, ...meta: any[]) => void;
    info: (message: string, ...meta: any[]) => void;
    warn: (message: string, ...meta: any[]) => void;
    error: (message: string, ...meta: any[]) => void;
}
declare const config: Config;
export default config;
export declare function configure(cfg: Partial<Config> | ((config: Config) => void)): void;
