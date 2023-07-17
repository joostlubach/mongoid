import { ValidationError, ValidatorResultSerialized } from 'validator';
import Model from './Model';
import { ModelClass } from './typings';
export default class InvalidModelError<M extends Model> extends Error {
    constructor(Model: ModelClass<M>, result: ValidatorResultSerialized);
    readonly Model: ModelClass<M>;
    readonly result: ValidatorResultSerialized;
    get errors(): ValidationError[];
    toJSON(): {
        message: string;
        result: ValidatorResultSerialized;
    };
    static description(Model: ModelClass<any>, result: ValidatorResultSerialized, pretty?: boolean): string;
    printFriendly(): void;
}
