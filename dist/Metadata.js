import { pluralize } from 'inflected';
import { isArray, snakeCase } from 'lodash';
import { ObjectId } from 'mongodb';
import { object } from 'validator/types';
import AggregationPipeline from './AggregationPipeline';
import db from './client';
import config from './config';
import { isVirtual } from './types/virtual';
export default class Metadata {
    //------
    // Construction
    constructor(Model) {
        this.Model = Model;
        this.config = deriveConfig(Model);
    }
    Model;
    config;
    //------
    // Db
    get collectionName() {
        if (this.config.collectionName != null) {
            return this.config.collectionName;
        }
        else {
            return snakeCase(pluralize(this.config.name));
        }
    }
    get collection() {
        return db().collection(this.collectionName);
    }
    idToMongo(id) {
        if (id != null && this.config.idAdapter != null) {
            return this.config.idAdapter.toMongo(id);
        }
        else {
            return id;
        }
    }
    idFromMongo(mongoID) {
        if (this.config.idAdapter != null) {
            return this.config.idAdapter.fromMongo(mongoID);
        }
        else {
            return mongoID;
        }
    }
    get indexes() {
        return [
            ...this.config.indexes,
            { '_references.model': 1, '_references.id': 1 },
        ];
    }
    async createIndexes() {
        for (const index of this.indexes) {
            const [keys, options] = isArray(index)
                ? index
                : [index, {}];
            const name = indexName(keys, options);
            if (!options.name) {
                options.name = name;
            }
            config.logger.debug(`Creating index: ${this.Model.name}.${name}`);
            try {
                await this.collection.createIndex(keys, options);
            }
            catch (error) {
                if (error.codeName === 'IndexOptionsConflict') {
                    // This we can solve by dropping & recreating the index.
                    await this.collection.dropIndex(name);
                    await this.collection.createIndex(keys, options);
                }
                else {
                    throw error;
                }
            }
        }
    }
    //------
    // Views
    get views() {
        return {
            ...this.config.views,
        };
    }
    async createViews() {
        for (const [name, fn] of Object.entries(this.views)) {
            config.logger.debug(`Creating view: ${this.Model.name}.${name}`);
            const pipeline = new AggregationPipeline(this.Model);
            fn(pipeline);
            // Make sure to drop it first.
            const existing = await db().listCollections({ name }).toArray();
            if (existing.length > 0) {
                await db().collection(name).drop();
            }
            await db().createCollection(name, {
                viewOn: this.collectionName,
                pipeline: pipeline.resolveStages(),
            });
        }
    }
    //------
    // Schema
    generateID(model) {
        if (this.config.idGenerator != null) {
            return this.config.idGenerator(model);
        }
        else {
            return new ObjectId();
        }
    }
    getSchema(model) {
        if (this.config.polymorphic) {
            const type = model.type;
            if (type == null) {
                return {};
            }
            const schema = this.config.schemas[type];
            if (schema == null) {
                throw new ReferenceError(`No schema found for polymorphic type ${model.constructor.name}.${type}`);
            }
            return schema;
        }
        else {
            return this.config.schema || {};
        }
    }
    getSchemas() {
        if (this.config.polymorphic) {
            return Object.values(this.config.schemas);
        }
        else {
            return [this.config.schema];
        }
    }
    get modelType() {
        if (this.config.polymorphic) {
            return object({
                required: false,
                polymorphic: true,
                schemas: this.config.schemas,
            });
        }
        else {
            return object({
                required: false,
                schema: this.config.schema,
            });
        }
    }
    findSchemaType(model, path) {
        let found = null;
        this.modelType.traverse?.(model, [], (_, p, type) => {
            if (p === path) {
                found = type;
                return false;
            }
        });
        return found;
    }
    getAttributes(model, includeVirtual = false) {
        const attributes = {};
        const schema = this.getSchema(model);
        // Add the polymorphic type key
        if (this.config.polymorphic) {
            attributes.type = model.type;
        }
        // Add timestamps.
        if (includeVirtual) {
            attributes.createdAt = model.createdAt;
            attributes.updatedAt = model.updatedAt;
        }
        // Add all other attributes.
        for (const name of Object.keys(schema)) {
            if (!includeVirtual && isVirtual(schema[name])) {
                continue;
            }
            attributes[name] = model[name];
        }
        return attributes;
    }
    serialize(model, includeVirtual) {
        const attributes = this.getAttributes(model, includeVirtual);
        const serialized = this.modelType.serialize(attributes);
        if (includeVirtual) {
            serialized.id = model.id;
            serialized.createdAt = model.createdAt;
            serialized.updatedAt = model.updatedAt;
        }
        else {
            // Delete all virtual attributes.
            for (const [name, type] of Object.entries(this.getSchema(model))) {
                if (isVirtual(type)) {
                    delete serialized[name];
                }
            }
        }
        return serialized;
    }
}
function deriveConfig(Model) {
    const { collectionName, schema, schemas, escapeKeys, idGenerator, idAdapter, indexes, transient, views, unique, } = Model;
    const modelConfig = {
        name: Model.name,
        escapeKeys: false,
        idGenerator: config.idGenerator,
        idAdapter: null,
        indexes: [],
        views: {},
        transient: [],
        unique: {},
    };
    if (collectionName != null) {
        modelConfig.collectionName = collectionName;
    }
    if (schemas != null) {
        modelConfig.polymorphic = true;
        modelConfig.schemas = schemas;
    }
    else {
        modelConfig.schema = schema;
    }
    if (escapeKeys != null) {
        modelConfig.escapeKeys = escapeKeys;
    }
    if (idGenerator != null) {
        modelConfig.idGenerator = idGenerator;
    }
    if (idAdapter != null) {
        modelConfig.idAdapter = idAdapter;
    }
    if (indexes != null) {
        modelConfig.indexes = indexes;
    }
    if (transient != null) {
        modelConfig.transient = transient;
    }
    if (views != null) {
        modelConfig.views = views;
    }
    if (unique != null) {
        modelConfig.unique = unique;
    }
    if (escapeKeys != null) {
        modelConfig.escapeKeys = escapeKeys;
    }
    return modelConfig;
}
function indexName(keys, options) {
    if (options.name) {
        return options.name;
    }
    if (Object.values(keys).includes('text')) {
        return 'text';
    }
    return Object.keys(keys).map(key => `${key}_${keys[key]}`).join('_');
}
