import chalk from 'chalk';
import { cloneDeep, mapKeys, omit, pick } from 'lodash';
import { sparse } from 'ytil';
import AggregationPipeline from './AggregationPipeline';
import { emitDelete } from './changes';
import db from './client';
import config from './config';
import Cursor from './Cursor';
import { withClientStackTrace } from './util';
export default class Query {
    //------
    // Construction & properties
    constructor(Model, options = {}) {
        this.options = options;
        this.Model = Model;
    }
    Model;
    options;
    copy() {
        const copy = new Query(this.Model, { ...this.options });
        copy.filters = cloneDeep(this.filters);
        copy.sorts = cloneDeep(this.sorts);
        copy.skipCount = this.skipCount;
        copy.limitCount = this.limitCount;
        copy.collation = this.collation;
        return copy;
    }
    switchCollection(collectionName) {
        const copy = this.copy();
        copy.options.collection = collectionName;
        return copy;
    }
    get collection() {
        if (this.options.collection != null) {
            return db().collection(this.options.collection);
        }
        else {
            return this.Model.meta.collection;
        }
    }
    filters = [];
    projections = null;
    sorts = [];
    skipCount = null;
    limitCount = null;
    collation = null;
    /**
     * Gets all filters as a `{$and: [...]}` compound. If there are duplicate keys, e.g. two `$or`-keys, this will
     * make sure all filters end up in the Mongo DB query.
     */
    get compoundFilters() {
        if (this.filters.length === 0) {
            return {};
        }
        return { $and: this.filters };
    }
    /**
     * Flattens all filters to a single object. Duplicate keys will be overwritten.
     */
    get flattenedFilters() {
        return Object.assign({}, ...this.filters);
    }
    //------
    // Modification interface
    filter(...filters) {
        const copy = this.copy();
        for (const filter of filters) {
            const { id, ...rest } = removeUndefineds(filter);
            if (id != null) {
                copy.filters.push({ _id: id });
            }
            if (Object.keys(rest).length > 0) {
                copy.filters.push(rest);
            }
        }
        return copy;
    }
    removeFilter(name) {
        const copy = this.copy();
        copy.filters = this.filters.map(filter => {
            if (name in filter) {
                filter = omit(filter, name);
            }
            if (Object.keys(filter).length === 0) {
                return null;
            }
            else {
                return filter;
            }
        }).filter(Boolean);
        return copy;
    }
    clearFilters() {
        const copy = this.copy();
        copy.filters = [];
        return copy;
    }
    none() {
        const copy = this.copy();
        copy.filters = [{ id: -1 }];
        return copy;
    }
    project(projections) {
        const copy = this.copy();
        copy.projections = projections;
        return copy;
    }
    sort(sorts) {
        const { id, ...rest } = sorts;
        const copy = this.copy();
        copy.sorts.unshift({ ...rest, ...(id == null ? null : { _id: id }) });
        return copy;
    }
    clearSorts() {
        const copy = this.copy();
        copy.sorts = [];
        return copy;
    }
    skip(count) {
        const copy = this.copy();
        copy.skipCount = count;
        return copy;
    }
    limit(count) {
        const copy = this.copy();
        copy.limitCount = count;
        return copy;
    }
    union(other) {
        const merged = new Query(this.Model);
        merged.filters = [{
                $or: [...this.filters, ...merged.filters],
            }];
        merged.sorts = [...this.sorts, ...other.sorts];
        merged.projections =
            this.projections == null && other.projections == null ? {} :
                this.projections == null ? { ...other.projections } :
                    other.projections == null ? { ...this.projections } :
                        { ...this.projections, ...other.projections };
        const skipCounts = sparse([this.skipCount, other.skipCount]);
        merged.skipCount = skipCounts.length > 0 ? Math.min(...skipCounts) : null;
        const limitCounts = sparse([this.limitCount, other.limitCount]);
        merged.limitCount = limitCounts.length > 0 ? Math.max(...limitCounts) : null;
        return merged;
    }
    //------
    // Pipeline conversion
    toPipeline() {
        const pipeline = new AggregationPipeline(this.Model);
        if (Object.keys(this.compoundFilters).length > 0) {
            pipeline.match(this.compoundFilters);
        }
        for (const sort of this.sorts) {
            pipeline.sort(sort);
        }
        if (this.skipCount != null) {
            pipeline.skip(this.skipCount);
        }
        if (this.limitCount != null) {
            pipeline.limit(this.limitCount);
        }
        return pipeline;
    }
    //------
    // Data retrieval
    async count(options = {}) {
        if (config.traceEnabled) {
            this.trace('CNT');
        }
        return await this.collection.countDocuments(this.compoundFilters, options);
    }
    async total(options = {}) {
        return await this.skip(null).limit(null).count(options);
    }
    async get(id) {
        if (id == null) {
            throw new TypeError("ID must be specified");
        }
        const mongoID = this.Model.meta.idToMongo(id);
        return await this.findOne({ id: mongoID });
    }
    async all() {
        return await withClientStackTrace(() => this.run().toArray());
    }
    async first() {
        const documents = await this.limit(1).all();
        return documents[0] ?? null;
    }
    async findOne(filters) {
        return await this.filter(filters || {}).first();
    }
    async forEach(iterator) {
        return await withClientStackTrace(async () => {
            await this.run().forEach(iterator);
        });
    }
    async map(iterator) {
        return await withClientStackTrace(async () => {
            const results = [];
            let index = 0;
            await this.run().forEach(async (model) => {
                results.push(await iterator(model, index++));
            });
            return results;
        });
    }
    async pluck(...properties) {
        return await withClientStackTrace(async () => {
            const project = properties.reduce((project, prop) => ({
                ...project,
                [prop === 'id' ? '_id' : prop]: 1,
            }), {});
            const values = [];
            await this.raw({ project }).forEach(doc => {
                const get = (prop) => doc[prop === 'id' ? '_id' : prop];
                if (properties.length === 1) {
                    values.push(get(properties[0]));
                }
                else {
                    values.push(properties.reduce((result, prop) => ({ ...result, [prop]: get(prop) }), {}));
                }
            });
            return values;
        });
    }
    /**
     * Runs this query and returns a cursor returning model instances.
     */
    run(options = {}) {
        const { include, ...rest } = options;
        return new Cursor(this, this.raw(rest), { include });
    }
    /**
     * Explains this query (calls `.explain()` on the underlying cursor).
     */
    async explain() {
        return await withClientStackTrace(() => this.raw().explain());
    }
    /**
     * Runs the query and retrieves a raw MongoDB cursor.
     */
    raw(options = {}) {
        const { project = serializeProjections(this.projections), trace = config.traceEnabled, label, } = options;
        let cursor = this.collection
            .find(this.compoundFilters);
        if (this.collation != null) {
            cursor = cursor.collation(this.collation);
        }
        if (project != null) {
            cursor = cursor.project(project);
        }
        for (const sort of this.sorts) {
            cursor = cursor.sort(sort);
        }
        if (this.skipCount != null) {
            cursor = cursor.skip(this.skipCount);
        }
        if (this.limitCount != null) {
            cursor = cursor.limit(this.limitCount);
        }
        if (trace) {
            this.trace(label);
        }
        return cursor;
    }
    toRawArray() {
        return withClientStackTrace(() => this.raw().toArray());
    }
    trace(label = 'QRY') {
        // Find out the origin.
        const stackTarget = {};
        Error.captureStackTrace(stackTarget);
        let source = null;
        for (const site of stackTarget.stack.split('\n').slice(1)) {
            if (site.includes('mongoid')) {
                continue;
            }
            source = site.trim();
            break;
        }
        const parts = sparse([
            chalk.magenta(label),
            chalk.bold(this.Model.name + (this.options.collection ? ` (${this.options.collection})` : '')),
            chalk.blue(`[${this.skipCount ?? 0} - ${this.limitCount == null ? '∞' : (this.skipCount ?? 0) + this.limitCount}]`),
            chalk.dim(JSON.stringify(this.filters)),
            source != null ? chalk.dim.underline(source) : null,
        ]);
        config.logger.debug(parts.join(' '));
    }
    //------
    // Updates
    /**
     * Updates matching documents with new values.
     *
     * @param updates The updates.
     */
    async update(updates) {
        return await withClientStackTrace(() => this.collection.updateMany(this.compoundFilters, updates));
    }
    /**
     * Deletes matching documents.
     */
    async delete(triggerChange = true) {
        if (triggerChange) {
            this.filter(this.compoundFilters).forEach(model => {
                emitDelete(model);
            });
        }
        return await withClientStackTrace(() => this.collection.deleteMany(this.compoundFilters));
    }
    //-------
    // Serialization
    serialize() {
        return pick(this, ['filters', 'projections', 'sorts', 'skipCount', 'limitCount', 'collation']);
    }
    static deserialize(Model, raw) {
        const query = new Query(Model);
        Object.assign(query, raw);
        return query;
    }
}
function serializeProjections(projections) {
    if (projections == null) {
        return null;
    }
    return mapKeys(projections, (val, key) => key === 'id' ? '_id' : key);
}
function removeUndefineds(filters) {
    const result = {};
    for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}
