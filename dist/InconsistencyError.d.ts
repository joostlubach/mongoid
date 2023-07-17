import Model from './Model';
import { ModelClass } from './typings';
export default class InconsistencyError<M extends Model> extends Error {
    constructor(Model: ModelClass<M>, message: string);
    readonly Model: ModelClass<M>;
    toJSON(): {
        message: string;
    };
}
