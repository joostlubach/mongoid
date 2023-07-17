import { Collection, DeleteResult, Document, UpdateResult } from 'mongodb';
import { ObjectSchema, ValidatorResult } from 'validator';
import Metadata from './Metadata';
import Query, { QueryOptions } from './Query';
import { ID, IDOf, ModelClass, SaveOptions, UniqueSpec } from './typings';
export default class Model {
    constructor(attributes?: Record<string, any>);
    id: ID;
    originals: Partial<this> | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    /**
     * Whether this model has not yet been saved to the database.
     */
    isNew: boolean;
    static get meta(): Metadata<any>;
    static get collection(): Collection;
    get meta(): Metadata<this>;
    get schema(): ObjectSchema;
    private static initialized;
    /**
     * Initializes this model.
     */
    static initialize(): Promise<void>;
    ensureID(): Promise<ID>;
    get mongoID(): ID;
    /**
     * Gets all attributes that are defined in the schema.
     */
    get attributes(): Record<string, any>;
    get(attribute: string): any;
    /**
     * Serializes this model for sending over JSON.
     */
    serialize(): Record<keyof this, any>;
    /**
     * Casts given attributes to the types specified in this model's schema. This is done automatically
     * in the {@link #assign} function.
     */
    coerce(raw: Record<string, any>, partial: boolean): Record<string, any>;
    /**
     * Casts the attributes in this model again. Happens automatically before saving.
     */
    recoerce(): this;
    /**
     * Assigns attributes to this model.
     *
     * @param raw The attributes to assign.
     */
    assign(raw: Record<string, any>): void;
    /**
     * Hydrates this model from the database.
     *
     * @param attributes The attributes to hydrate with.
     */
    hydrate(document: Record<string, any>): Promise<void>;
    /**
     * Creates a new model by hydration from the database.
     *
     * @param attributes The attributes to hydrate with.
     */
    static hydrate<M extends Model>(this: ModelClass<M>, document: Record<string, any>): Promise<M>;
    /**
     * Checks whether this model (or any specific attribute) has changed with respect to the latest loaded
     * state from the database.
     *
     * @param attribute An attribute to check or leave out to check the entire model.
     */
    isDirty(attribute?: keyof this): boolean;
    markClean(): void;
    getDirtyAttributes(): string[];
    /**
     * Builds a query for this model.
     */
    static query<M extends Model>(this: ModelClass<M>, options?: QueryOptions): Query<M>;
    /**
     * Counts the number of models of this type.
     *
     * @param query An optional query object.
     */
    static count<M extends Model>(this: ModelClass<M>, query?: Record<string, any>): Promise<number>;
    /**
     * Retrieves a model from the database by its ID.
     *
     * @param id The ID of the model to retrieve.
     */
    static get<M extends Model>(this: ModelClass<M>, id: IDOf<M>): Promise<M | null>;
    /**
     * Shortcut for `Model.query().filter({...})`.
     */
    static filter<M extends Model>(this: ModelClass<M>, filters: Record<string, any>): Query<M>;
    /**
     * Retrieves the first model of this type in the database, satisfying some query.
     *
     * @param query The query object.
     */
    static findOne<M extends Model>(this: ModelClass<M>, filters: Record<string, any>): Promise<M | null>;
    /**
     * Builds a query by filtering  all models of this type with a simple query.
     *
     * @param query The query object.
     */
    static find<M extends Model>(this: ModelClass<M>, filters: Record<string, any>): Promise<M[]>;
    static aggregate<M extends Model>(this: ModelClass<M>, pipeline?: Record<string, any>[]): Promise<M[]>;
    /**
     * Retrieves the first model of this type.
     */
    static first<M extends Model>(this: ModelClass<M>): Promise<M | null>;
    /**
     * Retrieves the last model of this type.
     */
    static last<M extends Model>(this: ModelClass<M>): Promise<M | null>;
    /**
     * Retrieves all models of this type.
     */
    static all<M extends Model>(this: ModelClass<M>): Promise<M[]>;
    /**
     * Reloads this model from the database. If the model has no ID, this does nothing.
     */
    reload(): Promise<this | null>;
    static create<M extends Model>(this: ModelClass<M>, attributes?: Record<string, any>): Promise<M>;
    /**
     * Finds or creates a model.
     *
     * @param required
     * 	 The attributes to filter by and the use when creating.
     * @param extra
     *   Extra arguments that are stored when the model is created. If the model already existed, these
     *   values are ignored.
     */
    static ensure<M extends Model>(this: ModelClass<M>, required: Record<string, any>, defaults?: Record<string, any> | ((model: M) => any), updates?: Record<string, any> | ((model: M) => any), options?: SaveOptions): Promise<M>;
    update(attributes: Record<string, any>): Promise<void>;
    static update(filter: Record<string, any>, updates: Record<string, any>): Promise<UpdateResult | Document>;
    /**
     * Deletes all models of this type.
     * Note: does not perform pre-deletion checks or emit delete events.
     */
    static deleteAll(): Promise<DeleteResult>;
    /**
     * Deletes this model.
     */
    delete(): Promise<DeleteResult>;
    save(options?: SaveOptions): Promise<void>;
    private buildInsertionDocument;
    private buildUpdate;
    private escapeKeys;
    private unescapeKeys;
    private beforeValidate;
    private beforeSave;
    private afterSave;
    private beforeDelete;
    private afterDelete;
    /**
     * Validates this model.
     */
    validate(): Promise<ValidatorResult<this>>;
    protected validateExtra(result: ValidatorResult<any>): Promise<void>;
    validateUnique(attribute: keyof this, unique: boolean | UniqueSpec, result: ValidatorResult<any>): Promise<void>;
}
