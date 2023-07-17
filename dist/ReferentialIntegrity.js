import chalk from 'chalk';
import { isArray, some, uniq } from 'lodash';
import { flatMap, MapBuilder, modifyInObject, splitArray } from 'ytil';
import config from './config';
import models from './models';
import { isCustomStrategy, isSetStrategy, Ref } from './types/ref';
export default class ReferentialIntegrity {
    model;
    constructor(model) {
        this.model = model;
    }
    get Model() {
        return this.model.constructor;
    }
    /**
     * Checks all referential integrity rules for this module.
     */
    async check(options = {}) {
        const invalid = [];
        for (const reference of this.collectReferences()) {
            const retval = await this.checkReference(reference);
            if (retval !== true) {
                invalid.push([reference, retval]);
            }
        }
        if (options.fix) {
            if (some(invalid, ([, strategy]) => strategy === 'cascade')) {
                await this.model.delete();
                return { status: 'deleted' };
            }
            if (some(invalid, ([, strategy]) => strategy === 'delete')) {
                await this.Model.filter({ id: this.model.id }).delete();
                return { status: 'deleted' };
            }
            const fixedReferences = [];
            const failedReferences = [];
            for (const [reference, strategy] of invalid) {
                const fixed = await this.fixReference(this.model, reference, strategy);
                if (fixed) {
                    fixedReferences.push(reference);
                }
                else {
                    failedReferences.push(reference);
                }
            }
            if (fixedReferences.length > 0) {
                await this.model.save();
            }
            return {
                status: 'fixed',
                invalid: invalid.map(it => it[0]),
                fixed: fixedReferences,
                failed: failedReferences,
            };
        }
        else if (invalid.length > 0) {
            return {
                status: 'invalid',
                invalid: invalid.map(it => it[0]),
            };
        }
        else {
            return { status: 'ok' };
        }
    }
    async checkReference(reference) {
        const Model = models[reference.model];
        if (Model == null) {
            throw new Error(`Invalid reference: model \`${reference.model}\` does not exist`);
        }
        const count = await Model.count({ id: reference.id });
        if (count > 0) {
            return true;
        }
        const strategy = findRefStrategy(this.model, reference.path);
        if (strategy == null) {
            throw new Error(`Cannot fix reference ${reference.path}: no strategy found`);
        }
        return strategy;
    }
    /**
     * Derives a flat list of references from the model from its `ref`-type declarations. This list is indexed by MongoDB,
     * and is used to look up all models affected by a deletion.
     */
    collectReferences() {
        const references = [];
        this.model.meta.modelType.traverse?.(this.model, [], (value, path, type) => {
            if (type.name !== 'ref') {
                return;
            }
            if (!(value instanceof Ref)) {
                return;
            }
            const options = type.options;
            if (options.onDelete === 'ignore') {
                return;
            }
            const strategy = options.onDelete === 'delete' ? 'delete' :
                options.onDelete === 'disallow' ? 'disallow' :
                    options.onDelete === 'cascade' ? 'cascade' :
                        'other';
            references.push({
                path: path,
                model: value.Model.name,
                id: value.id,
                strategy: strategy,
            });
        });
        return references;
    }
    /**
     * Retrieves a list of all models affected by a deletion of the model, and all affected references by model.
     */
    async findAffectedModels() {
        const affectedModels = [];
        const promises = Object.values(models).map(async (Model) => {
            const items = await Model.filter({
                _references: {
                    $elemMatch: {
                        model: this.Model.name,
                        id: this.model.id,
                    },
                },
            }).project({
                id: 1,
                _references: 1,
            }).toRawArray();
            for (const item of items) {
                affectedModels.push({
                    Model: Model,
                    id: item._id,
                    references: item._references.filter((ref) => (ref.model === this.Model.name && ref.id === this.model.id)),
                });
            }
        });
        await Promise.all(promises);
        return affectedModels;
    }
    /**
     * Processes deletion of the model.
     */
    async processDeletion() {
        // Find all effected models by this deletion.
        const affectedModels = await this.findAffectedModels();
        this.logDeletion(affectedModels);
        // Find all models that have a 'cascade' or 'delete' reference. They will be deleted.
        const [deletedModels, rest] = splitArray(affectedModels, it => some(it.references, it => it.strategy === 'cascade' || it.strategy === 'delete'));
        // For those models that remain, check if any of them disallow the deletion. If so, throw an error.
        const references = flatMap(rest, model => model.references);
        const disallowedReferences = references.filter(ref => ref.strategy === 'disallow');
        if (disallowedReferences.length > 0) {
            throw new ReferentialIntegrityError("Deletion disallowed due to referential integrity rules", disallowedReferences);
        }
        // Delete all the models to delete. Use a fast method for delete models, and a slow method (one by one) for the cascade models.
        const [cascadeModels, deleteModels] = splitArray(deletedModels, it => some(it.references, it => it.strategy === 'cascade'));
        await this.fastDeleteModels(deleteModels);
        await Promise.all(cascadeModels.map(model => this.cascadeDelete(model)));
        // Finally, process the rest.
        await Promise.all(rest.map(model => this.processReferences(model)));
    }
    async fastDeleteModels(affectedModels) {
        const byModelClass = MapBuilder.groupBy(affectedModels, model => model.Model);
        for (const [Model, models] of byModelClass) {
            const paths = uniq(flatMap(models, model => model.references).map(ref => ref.path));
            await Model.filter({
                $or: paths.map(path => ({
                    [path]: this.model.id,
                })),
            }).delete();
        }
    }
    async cascadeDelete(affectedModel) {
        const model = await affectedModel.Model.get(affectedModel.id);
        await model.delete();
    }
    async processReferences(affectedModel) {
        const model = await affectedModel.Model.get(affectedModel.id);
        const modifieds = [];
        for (const reference of affectedModel.references) {
            const strategy = findRefStrategy(model, reference.path);
            if (strategy == null) {
                continue;
            }
            const modified = await this.fixReference(model, reference, strategy);
            modifieds.push(modified);
        }
        if (some(modifieds)) {
            await model.save();
        }
    }
    async fixReference(model, reference, strategy) {
        if (isCustomStrategy(strategy)) {
            return await strategy(model, reference);
        }
        return modifyInObject(model, reference.path, (_, parent, key) => {
            if (strategy === 'unset') {
                if (isArray(parent)) {
                    parent.splice(key, 1);
                }
                else {
                    parent[key] = null;
                }
            }
            else if (isSetStrategy(strategy)) {
                parent[key] = strategy.$set;
            }
            else {
                return false;
            }
        });
    }
    logDeletion(affected) {
        const modelDesc = `${this.Model.name} ${this.model.id}`;
        const affectedModelDesc = (model) => `${model.Model.name} ${model.id}`;
        if (affected.length === 0) {
            config.logger.debug(chalk `RefInt - Deleting {red ${modelDesc}}`);
        }
        else {
            config.logger.debug(chalk `RefInt - Deleting {red ${modelDesc}} {dim (${affected.map(affectedModelDesc).join(', ')})}`);
        }
    }
}
function findRefStrategy(model, path) {
    const type = model.meta.findSchemaType(model, path);
    if (type?.name !== 'ref') {
        return null;
    }
    return type.options.onDelete ?? 'unset';
}
export class ReferentialIntegrityError extends Error {
    disallowedReferences;
    constructor(message, disallowedReferences) {
        super(message);
        this.disallowedReferences = disallowedReferences;
    }
}
