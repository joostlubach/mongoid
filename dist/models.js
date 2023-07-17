import Model from './Model';
const models = {};
export default models;
export function register(Class) {
    const ModelClass = Class;
    if (!(ModelClass.prototype instanceof Model)) {
        throw new Error(`${Class.name} cannot be registered as a model class`);
    }
    models[ModelClass.name] = ModelClass;
}
