import Model from './Model';
import { Modifications, ModelClass, ID } from './typings';
export type ChangeType = 'create' | 'update' | 'delete';
export default class Change<M extends Model> {
    readonly type: ChangeType;
    readonly Model: ModelClass<M>;
    readonly id: ID;
    readonly modifications: Modifications<M>;
    constructor(type: ChangeType, Model: ModelClass<M>, id: ID, modifications: Modifications<M>);
    static fromModel<M extends Model>(model: M, type: ChangeType): Change<M>;
    get prevAttributes(): Partial<M>;
    get nextAttributes(): Partial<M>;
    modified(attribute: string): boolean;
}
