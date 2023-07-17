import { Collection, CreateIndexesOptions } from 'mongodb';
export declare function createIndex(collection: Collection, name: string, keys: Record<string, any>, options?: CreateIndexesOptions): Promise<void>;
