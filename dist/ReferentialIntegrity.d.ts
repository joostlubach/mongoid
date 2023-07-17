import Model from './Model';
import { ID, ModelClass } from './typings';
export default class ReferentialIntegrity {
    private readonly model;
    constructor(model: Model);
    private get Model();
    /**
     * Checks all referential integrity rules for this module.
     */
    check(options?: CheckOptions): Promise<CheckResult>;
    private checkReference;
    /**
     * Derives a flat list of references from the model from its `ref`-type declarations. This list is indexed by MongoDB,
     * and is used to look up all models affected by a deletion.
     */
    collectReferences(): Reference[];
    /**
     * Retrieves a list of all models affected by a deletion of the model, and all affected references by model.
     */
    findAffectedModels(): Promise<AffectedModel[]>;
    /**
     * Processes deletion of the model.
     */
    processDeletion(): Promise<void>;
    private fastDeleteModels;
    private cascadeDelete;
    private processReferences;
    private fixReference;
    private logDeletion;
}
export interface CheckOptions {
    fix?: boolean;
}
export type CheckResult = {
    status: 'ok';
} | {
    status: 'invalid';
    invalid: Reference[];
} | {
    status: 'deleted';
} | {
    status: 'fixed';
    invalid: Reference[];
    fixed: Reference[];
    failed: Reference[];
};
export interface Reference {
    path: string;
    model: string;
    id: ID;
    strategy: 'disallow' | 'delete' | 'cascade' | 'other';
}
export interface AffectedModel {
    Model: ModelClass<any>;
    id: ID;
    references: Reference[];
}
export declare class ReferentialIntegrityError extends Error {
    disallowedReferences: Reference[];
    constructor(message: string, disallowedReferences: Reference[]);
}
