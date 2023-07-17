import chalk from 'chalk';
import { omit, omitBy, pick } from 'lodash';
import { Collection } from 'mongodb';
import AggregationCursor from './AggregationCursor';
import config from './config';
import { withClientStackTrace } from './util';
export default class AggregationPipeline {
    ModelOrCollection;
    stages;
    constructor(ModelOrCollection, stages = []) {
        this.ModelOrCollection = ModelOrCollection;
        this.stages = stages;
        if (ModelOrCollection instanceof Collection) {
            this.Model = null;
            this.collection = ModelOrCollection;
        }
        else {
            this.Model = ModelOrCollection;
            this.collection = this.Model.collection;
        }
    }
    Model;
    collection;
    _facetName = null;
    get facetName() {
        return this._facetName;
    }
    //------
    // Stages
    /**
     * Adds an arbitrary stage to the pipeline.
     *
     * @param stage The stage to add.
     */
    addStage(...stages) {
        this.stages.push(...stages);
        return this;
    }
    /**
     * Adds a $match stage to the pipeline.
     * @param $match The $match stage.
     */
    match($match) {
        return this.addStage({
            $match: omitBy($match, val => val === undefined),
        });
    }
    lookup($lookup) {
        // Check if a simple collection name is specified, if so just pass on.
        if (typeof $lookup.from === 'string') {
            return this.addStage({ $lookup });
        }
        // Check for simple lookups using localField & foreignField.
        if ('localField' in $lookup) {
            const { from, ...rest } = $lookup;
            return this.addStage({
                $lookup: {
                    from: from.meta.collectionName,
                    foreignField: '_id',
                    ...rest,
                },
            });
        }
        // Advanced case: wrap lookup pipeline in new AggregationPipeline object.
        const { from, pipeline: initialPipeline, stages, ...rest } = $lookup;
        const pipeline = initialPipeline ?? new AggregationPipeline(from, stages);
        this.addStage({
            $lookup: {
                from: from.meta.collectionName,
                pipeline: pipeline,
                ...rest,
            },
        });
        return pipeline;
    }
    /**
     * Adds an `$unwind` stage to the pipeline.
     *
     * @param path The path to unwind.
     * @param options Additional options for the stage.
     */
    unwind(path, options = {}) {
        return this.addStage({
            $unwind: {
                path,
                ...options,
            },
        });
    }
    /**
     * Adds a `$group` stage to the pipeline.
     *
     * @param expression The `_id` expression for grouping.
     * @param project Aggregate projections.
     */
    group(expression, project) {
        return this.addStage({
            $group: {
                _id: expression,
                ...project,
            },
        });
    }
    /**
     * Adds an `$project` stage to the pipeline.
     *
     * @param $project The $project stage to add.
     */
    project($project) {
        return this.addStage({ $project });
    }
    /**
     * Adds an `$addFields` (or `$set`) stage to the pipeline.
     *
     * @param $addFields The $addFields stage to add.
     */
    addFields($addFields) {
        return this.addStage({ $addFields });
    }
    /**
     * Adds a `$sort` stage to the pipeline.
     *
     * @param $sort The $sort stage to add.
     */
    sort($sort) {
        return this.addStage({ $sort });
    }
    /**
     * Adds a `$limit` stage to the pipeline.
     *
     * @param $limit The $limit stage to add.
     */
    limit($limit) {
        if ($limit == null) {
            return this;
        }
        return this.addStage({ $limit });
    }
    /**
     * Adds a `$skip` stage to the pipeline.
     *
     * @param $skip The $skip stage to add.
     */
    skip($skip) {
        if ($skip == null) {
            return this;
        }
        return this.addStage({ $skip });
    }
    /**
     * Adds a `$count` stage to the pipeline.
     * @param field The field for the $count stage.
     */
    count(field) {
        return this.addStage({ $count: field });
    }
    facet(arg) {
        const facetStageIndex = this.stages.findIndex(it => '$facet' in it);
        if (facetStageIndex >= 0 && facetStageIndex !== this.stages.length - 1) {
            throw new Error("You must add all facet stages consecutively");
        }
        if (facetStageIndex < 0) {
            this.addStage({ $facet: {} });
        }
        const facetStage = this.stages[this.stages.length - 1];
        if (typeof arg === 'string') {
            const field = arg;
            const pipeline = new AggregationPipeline(this.Model ?? this.collection, []);
            pipeline._facetName = arg;
            facetStage.$facet[field] = { pipeline };
            return pipeline;
        }
        else {
            Object.assign(facetStage.$facet, arg);
            return this;
        }
    }
    //------
    // Stage resolution
    resolveStages() {
        return this.stages.map(stage => {
            if ('$lookup' in stage && 'pipeline' in stage.$lookup) {
                const { pipeline, ...rest } = stage.$lookup;
                return {
                    $lookup: {
                        ...rest,
                        pipeline: pipeline?.resolveStages() ?? [],
                    },
                };
            }
            else if ('$facet' in stage) {
                return {
                    $facet: Object.entries(stage.$facet).reduce((stage, [field, facet]) => {
                        if ('pipeline' in facet) {
                            return { ...stage, [field]: facet.pipeline.resolveStages() };
                        }
                        else {
                            return { ...stage, [field]: facet };
                        }
                    }, {}),
                };
            }
            else {
                return stage;
            }
        });
    }
    //------
    // Data retrieval
    /**
     * Counts documents matching the current '$match' stages. Any other operations are not applied.
     */
    countMatching() {
        const filters = [];
        for (const stage of this.stages) {
            if (!('$match' in stage)) {
                continue;
            }
            filters.push(stage.$match);
        }
        return withClientStackTrace(() => (this.collection.count({ $and: filters })));
    }
    /**
     * Retrieves all (hydrated) models for this pipeline.
     */
    async all() {
        return await this.run().toArray();
    }
    /**
     * Retrieves the first (hydrated) model from this pipeline.
     */
    async first() {
        const documents = await this.limit(1).all();
        return documents[0] ?? null;
    }
    /**
     * Asynchronously iterates through all models of this pipeline.
     *
     * @param iterator The iterator to use.
     */
    async forEach(iterator) {
        await this.run().forEach(iterator);
    }
    async pluck(...properties) {
        return await withClientStackTrace(async () => {
            const projection = {};
            for (let property of properties) {
                if (property === 'id') {
                    property = '_id';
                }
                projection[property] = 1;
            }
            let rows = await this.toRawArray();
            rows = rows.map(row => ({
                id: this.Model?.meta.idFromMongo(row._id) ?? row._id,
                ...omit(row, '_id'),
            }));
            if (properties.length === 1) {
                return rows.map(row => row[properties[0]]);
            }
            else {
                return rows.map(row => pick(row, properties));
            }
        });
    }
    /**
     * Runs this query and returns a cursor returning model instances.
     */
    run() {
        if (this.Model == null) {
            throw new Error("Cannot use .run() on a raw aggregation pipeline.");
        }
        return new AggregationCursor(this.Model, this.raw());
    }
    /**
     * Explains this query (calls `.explain()` on the underlying cursor).
     */
    async explain() {
        return await withClientStackTrace(async () => (this.raw().explain()));
    }
    /**
     * Runs the query and retrieves a raw MongoDB cursor.
     */
    raw() {
        const stages = this.resolveStages();
        if (config.traceEnabled) {
            config.logger.debug(chalk `AGG {bold ${this.Model?.name ?? this.collection.collectionName}} {dim ${JSON.stringify(stages)}}`);
        }
        return this.collection.aggregate(stages);
    }
    toRawArray() {
        return withClientStackTrace(() => {
            const cursor = this.raw();
            return cursor.toArray();
        });
    }
    static buildAccumulator(spec) {
        return {
            lang: 'js',
            init: spec.init.toString(),
            initArgs: spec.initArgs,
            accumulate: spec.accumulate.toString(),
            accumulateArgs: spec.accumulateArgs,
            merge: spec.merge.toString(),
            finalize: spec.finalize?.toString(),
        };
    }
}
