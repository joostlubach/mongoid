import Model from '../Model';
import { SaveOptions } from '../typings';
export default class ModifiedModelSet<M extends Model = any> {
    private models;
    get all(): M[];
    add(model: M): void;
    private afterSaveCallbacks;
    afterSave(callback: AfterSaveCallback<M>): void;
    save(options?: SaveOptions): Promise<void>;
}
export type AfterSaveCallback<M extends Model> = (model: M) => any;
