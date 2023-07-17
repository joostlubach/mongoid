import chalk from 'chalk';
import { cloneDeep, isEqual, isFunction, isPlainObject, some } from 'lodash';
import Validator, { INVALID } from 'validator';
import { deepMapKeys } from 'ytil';
import { emitCreate, emitDelete, emitUpdate } from './changes';
import config from './config';
import { callHook } from './hooks';
import InvalidModelError from './InvalidModelError';
import Metadata from './Metadata';
import Query from './Query';
import ReferentialIntegrity from './ReferentialIntegrity';
import { isVirtual } from './types/virtual';
import { withClientStackTrace } from './util';
export default class Model {
    //------
    // Constructor & properties
    constructor(attributes = {}) {
        const { id, ...rest } = attributes;
        const coerced = this.coerce(rest, false);
        Object.defineProperty(this, 'originals', { value: null, writable: true, enumerable: false });
        Object.defineProperty(this, 'isNew', { value: true, writable: true, enumerable: false });
        Object.assign(this, { id, ...coerced });
        this.isNew = true;
    }
    id = null;
    originals = null;
    createdAt = null;
    updatedAt = null;
    /**
     * Whether this model has not yet been saved to the database.
     */
    isNew;
    //------
    // Metadata
    static get meta() {
        return new Metadata(this);
    }
    static get collection() {
        return this.meta.collection;
    }
    get meta() {
        const klass = this.constructor;
        return klass.meta;
    }
    get schema() {
        return this.meta.getSchema(this);
    }
    //------
    // Lifecycle
    static initialized = false;
    /**
     * Initializes this model.
     */
    static async initialize() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        config.logger.info(chalk `Initializing model {yellow ${this.name}}`);
        await this.meta.createIndexes();
        await this.meta.createViews();
    }
    //------
    // ID
    async ensureID() {
        if (this.id == null) {
            this.id = await this.meta.config.idGenerator(this);
        }
        return this.id;
    }
    get mongoID() {
        return this.meta.idToMongo(this.id);
    }
    //------
    // Attributes
    /**
     * Gets all attributes that are defined in the schema.
     */
    get attributes() {
        return this.meta.getAttributes(this);
    }
    get(attribute) {
        return this[attribute];
    }
    /**
     * Serializes this model for sending over JSON.
     */
    serialize() {
        return this.meta.serialize(this, true);
    }
    /**
     * Casts given attributes to the types specified in this model's schema. This is done automatically
     * in the {@link #assign} function.
     */
    coerce(raw, partial) {
        const validator = new Validator();
        // For polymorphic models, the type property is important in determining the correct schema. If this
        // changes, we need to take special action.
        if (this.meta.config.polymorphic && 'type' in raw && raw.type !== this.type) {
            // Make sure to assign it first if it's specified in the raw array. This will make sure that the
            // expression `this.meta.modelType` will result in the correct type.
            Object.assign(this, { type: raw.type });
            // Also, the entire validation structure changes for this model, so we need to do a full recoerce.
            raw = Object.assign({}, this.meta.getAttributes(this, false), raw);
            partial = false;
        }
        // Conversely, if the 'raw' object does not have a type property, make sure that it uses the current
        // type property.
        if (this.meta.config.polymorphic && raw.type == null) {
            raw.type = this.type;
        }
        const coerced = validator.coerce(raw, this.meta.modelType, partial);
        if (coerced === INVALID) {
            return {};
        }
        // Delete virtual properties.
        const schema = this.meta.getSchema(this);
        for (const name of Object.keys(schema)) {
            if (isVirtual(schema[name])) {
                delete coerced[name];
            }
        }
        return coerced;
    }
    /**
     * Casts the attributes in this model again. Happens automatically before saving.
     */
    recoerce() {
        const attributes = this.meta.getAttributes(this, false);
        Object.assign(this, this.coerce(attributes, false));
        return this;
    }
    /**
     * Assigns attributes to this model.
     *
     * @param raw The attributes to assign.
     */
    assign(raw) {
        const coerced = this.coerce(raw, true);
        Object.assign(this, coerced);
    }
    /**
     * Hydrates this model from the database.
     *
     * @param attributes The attributes to hydrate with.
     */
    async hydrate(document) {
        const { _id, type, ...raw } = this.unescapeKeys(document);
        const id = this.meta.idFromMongo(_id);
        Object.assign(this, { id });
        const coerced = this.coerce({ type, ...raw }, false);
        if (Object.keys(coerced).length === 0) {
            return;
        }
        Object.assign(this, coerced);
        this.originals = cloneDeep(coerced);
        this.isNew = false;
        this.updatedAt = raw.updatedAt;
        this.createdAt = raw.createdAt;
    }
    /**
     * Creates a new model by hydration from the database.
     *
     * @param attributes The attributes to hydrate with.
     */
    static async hydrate(document) {
        const model = new this();
        await model.hydrate(document);
        return model;
    }
    /**
     * Checks whether this model (or any specific attribute) has changed with respect to the latest loaded
     * state from the database.
     *
     * @param attribute An attribute to check or leave out to check the entire model.
     */
    isDirty(attribute) {
        if (this.originals == null) {
            return true;
        }
        if (attribute === undefined) {
            const attributes = Object.keys(this.schema);
            return some(attributes, attribute => this.isDirty(attribute));
        }
        const type = this.schema[attribute];
        if (type == null || isVirtual(type)) {
            return false;
        }
        const originals = this.originals;
        if (this[attribute] == null) {
            return originals[attribute] != null;
        }
        else if (originals[attribute] == null) {
            return this[attribute] != null;
        }
        else {
            return !isEqual(this[attribute], originals[attribute]);
        }
    }
    markClean() {
        this.originals = cloneDeep(this.attributes);
    }
    getDirtyAttributes() {
        return Object.keys(this.schema)
            .filter(attr => this.isDirty(attr));
    }
    //------
    // Querying & loading
    /**
     * Builds a query for this model.
     */
    static query(options = {}) {
        return new Query(this, options);
    }
    /**
     * Counts the number of models of this type.
     *
     * @param query An optional query object.
     */
    static async count(query = {}) {
        return await this.query().filter(query).count();
    }
    /**
     * Retrieves a model from the database by its ID.
     *
     * @param id The ID of the model to retrieve.
     */
    static async get(id) {
        return await this.query().get(id);
    }
    /**
     * Shortcut for `Model.query().filter({...})`.
     */
    static filter(filters) {
        return this.query().filter(filters);
    }
    /**
     * Retrieves the first model of this type in the database, satisfying some query.
     *
     * @param query The query object.
     */
    static async findOne(filters) {
        return await this.query().findOne(filters);
    }
    /**
     * Builds a query by filtering  all models of this type with a simple query.
     *
     * @param query The query object.
     */
    static async find(filters) {
        return this.query().filter(filters).all();
    }
    static async aggregate(pipeline = []) {
        const all = await this.collection.aggregate(pipeline).toArray();
        return await Promise.all(all.map(model => this.hydrate(model)));
    }
    /**
     * Retrieves the first model of this type.
     */
    static async first() {
        return await this.query().first();
    }
    /**
     * Retrieves the last model of this type.
     */
    static async last() {
        const count = await this.count();
        if (count === 0) {
            return null;
        }
        const documents = await this.query().skip(count - 1).limit(1).all();
        return documents[0];
    }
    /**
     * Retrieves all models of this type.
     */
    static async all() {
        return await this.query().all();
    }
    /**
     * Reloads this model from the database. If the model has no ID, this does nothing.
     */
    async reload() {
        const { id } = this;
        if (id == null) {
            return null;
        }
        const document = await this.meta.collection.findOne({ _id: id });
        if (document == null) {
            return null;
        }
        await this.hydrate(document);
        return this;
    }
    static async create(attributes = {}) {
        const model = new this(attributes);
        await model.save();
        return model;
    }
    /**
     * Finds or creates a model.
     *
     * @param required
     * 	 The attributes to filter by and the use when creating.
     * @param extra
     *   Extra arguments that are stored when the model is created. If the model already existed, these
     *   values are ignored.
     */
    static async ensure(required, defaults = {}, updates = {}, options = {}) {
        let model = await this.findOne(required);
        if (model == null) {
            model = new this({ ...required });
            if (isFunction(defaults)) {
                await defaults(model);
            }
            else {
                model.assign(defaults);
                if (defaults.id != null) {
                    model.id = defaults.id;
                }
            }
        }
        if (isFunction(updates)) {
            model.recoerce();
            await updates(model);
        }
        else {
            model.assign(updates);
        }
        await model.save(options);
        return model;
    }
    async update(attributes) {
        this.assign(attributes);
        await this.save();
    }
    static async update(filter, updates) {
        return await this.query().filter(filter).update(updates);
    }
    //------
    // Deletion
    /**
     * Deletes all models of this type.
     * Note: does not perform pre-deletion checks or emit delete events.
     */
    static async deleteAll() {
        return await this.query().delete();
    }
    /**
     * Deletes this model.
     */
    async delete() {
        await this.beforeDelete();
        const integrity = new ReferentialIntegrity(this);
        await integrity.processDeletion();
        const result = await this.constructor.filter({ id: this.id }).delete();
        if (result.deletedCount != null && result.deletedCount > 0) {
            emitDelete(this);
            await this.afterDelete();
        }
        return result;
    }
    //------
    // Saving
    async save(options = {}) {
        if (options.validate !== false) {
            const result = await this.validate();
            if (!result.isValid) {
                throw new InvalidModelError(this.constructor, result.serialize());
            }
        }
        else {
            this.recoerce();
        }
        if (options.hooks !== false) {
            await this.beforeSave(this.isNew);
        }
        await withClientStackTrace(async () => {
            const now = new Date();
            if (this.isNew) {
                const document = await this.buildInsertionDocument(now);
                await this.meta.collection.insertOne(document, {
                    bypassDocumentValidation: true,
                });
                this.updatedAt = now;
                this.createdAt = now;
            }
            else {
                const filter = { _id: this.mongoID };
                const update = await this.buildUpdate(now);
                await this.meta.collection.updateOne(filter, update, {
                    bypassDocumentValidation: true,
                });
                this.updatedAt = now;
            }
        });
        if (this.isNew) {
            emitCreate(this);
        }
        else {
            emitUpdate(this);
        }
        const wasNew = this.isNew;
        this.isNew = false;
        if (options.hooks !== false) {
            await this.afterSave(wasNew);
        }
        // Update the originals so that the model is not seen as dirty anymore.
        this.originals = cloneDeep(this.attributes);
    }
    async buildInsertionDocument(now) {
        await this.ensureID();
        const data = this.escapeKeys(this.meta.serialize(this, false));
        for (const name of this.meta.config.transient) {
            delete data[name];
        }
        const referentialIntegrity = new ReferentialIntegrity(this);
        const document = {
            ...data,
            _id: this.mongoID,
            _references: referentialIntegrity.collectReferences(),
            updatedAt: now,
            createdAt: now,
        };
        return document;
    }
    async buildUpdate(now) {
        const $set = {
            updatedAt: now,
        };
        const serialized = this.escapeKeys(this.meta.serialize(this, false));
        for (const [name, value] of Object.entries(serialized)) {
            if (!this.isDirty(name)) {
                continue;
            }
            if (this.meta.config.transient.includes(name)) {
                continue;
            }
            $set[name] = value;
        }
        if (Object.keys($set).length === 0) {
            return { $set };
        }
        const referentialIntegrity = new ReferentialIntegrity(this);
        return {
            $set: {
                ...$set,
                _references: referentialIntegrity.collectReferences(),
            },
        };
    }
    escapeKeys(data) {
        if (!this.meta.config.escapeKeys) {
            return data;
        }
        return deepMapKeys(data, key => {
            return key.toString()
                .replace(/\\/g, '\\\\')
                .replace(/\./g, '\\u002e')
                .replace(/\$/g, '\\u0024');
        });
    }
    unescapeKeys(data) {
        if (!this.meta.config.escapeKeys) {
            return data;
        }
        return deepMapKeys(data, key => {
            return key.toString()
                .replace(/\\u0024/g, '$')
                .replace(/\\u002e/g, '.')
                .replace(/\\\\/g, '\\');
        });
    }
    //------
    // Change hooks
    async beforeValidate(isNew) {
        return await callHook(this, 'beforeValidate', isNew);
    }
    async beforeSave(isNew) {
        return await callHook(this, 'beforeSave', isNew);
    }
    async afterSave(isNew) {
        return await callHook(this, 'afterSave', isNew);
    }
    async beforeDelete() {
        return await callHook(this, 'beforeDelete');
    }
    async afterDelete() {
        return await callHook(this, 'afterDelete');
    }
    //------
    // Validation
    /**
     * Validates this model.
     */
    async validate() {
        this.recoerce();
        if (await this.beforeValidate(this.isNew)) {
            this.recoerce();
        }
        const validator = new Validator();
        const result = await validator.validate(this.attributes, this.meta.modelType, this.validateExtra.bind(this));
        return result;
    }
    async validateExtra(result) {
        for (const name of Object.keys(this.schema)) {
            const { unique } = this.schema[name].options;
            if (!unique) {
                continue;
            }
            await this.validateUnique(name, unique, result);
        }
    }
    async validateUnique(attribute, unique, result) {
        if (!this.isDirty(attribute)) {
            return;
        }
        const spec = isPlainObject(unique) ? unique : {};
        if (spec.if != null && !spec.if(this)) {
            return;
        }
        const serialized = this.serialize();
        const value = serialized[attribute];
        if (value == null) {
            return;
        }
        let query = new Query(this.constructor);
        query = query.filter({ [attribute]: value });
        // Use a scope if required.
        if (spec.scope != null) {
            for (const attribute of spec.scope) {
                query = query.filter({ [attribute]: serialized[attribute] });
            }
        }
        if (spec.query != null) {
            query = spec.query(query, this);
        }
        // Exclude this model instance.
        if (this.id != null) {
            query = query.filter({ id: { $ne: this.id } });
        }
        const count = await query.count();
        if (count > 0) {
            result.for(attribute).addError('unique', "This value is already taken");
        }
    }
}
