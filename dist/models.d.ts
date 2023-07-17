import Model from './Model';
import { ModelClass } from './typings';
declare const models: {
    [name: string]: ModelClass<any>;
};
export default models;
export declare function register<M extends Model>(Class: Function): void;
