import { Collection } from 'mongodb';
import { ObjectSchema, Type } from 'validator';
import Model from './Model';
import { ID, Index, ModelClass, ModelConfig, ViewFunction } from './typings';
export default class Metadata<M extends Model> {
    constructor(Model: ModelClass<M>);
    readonly Model: ModelClass<M>;
    readonly config: ModelConfig;
    get collectionName(): string;
    get collection(): Collection;
    idToMongo(id: ID): ID;
    idFromMongo(mongoID: ID): ID;
    get indexes(): Index[];
    createIndexes(): Promise<void>;
    get views(): Record<string, ViewFunction<any>>;
    createViews(): Promise<void>;
    generateID(model: Model): ID;
    getSchema(model: Model): ObjectSchema;
    getSchemas(): ObjectSchema[];
    get modelType(): Type<any>;
    findSchemaType(model: Model, path: string): Type<any> | null;
    getAttributes<M extends Model>(model: M, includeVirtual?: boolean): Partial<M>;
    serialize(model: M, includeVirtual: boolean): Record<keyof M, any>;
}
