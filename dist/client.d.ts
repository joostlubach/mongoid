import { Db, MongoClient } from 'mongodb';
export default function (): Db;
export declare function getClient(): MongoClient;
export declare function connect(uri: string): Promise<void>;
export declare function disconnect(): void;
export declare function connected(): boolean;
