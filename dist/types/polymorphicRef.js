import { INVALID } from 'validator';
import { isID } from '../ID';
import models from '../models';
import { Ref } from './ref';
function polymorphicRef(options) {
    return {
        name: 'polymorphicRef',
        options,
        coerce(value) {
            if (isPolymorphicRef(value)) {
                return value;
            }
            if (typeof value !== 'object') {
                return INVALID;
            }
            if (value == null) {
                return INVALID;
            }
            // Check for a ref plain object.
            if ('model' in value && 'id' in value) {
                const model = models[value.model];
                if (model == null) {
                    return INVALID;
                }
                return new PolymorphicRef(model, value.id);
            }
            else if (value instanceof Ref) {
                // Check for a regular Ref object.
                return new PolymorphicRef(value.Model, value.id);
            }
            else {
                // Check for an actual model instance.
                if (!isID(value.id)) {
                    return INVALID;
                }
                const modelName = value.constructor?.name;
                if (options.models != null && !options.models.includes(modelName)) {
                    return INVALID;
                }
                const model = models[modelName];
                if (model == null) {
                    return INVALID;
                }
                return new PolymorphicRef(model, value.id);
            }
        },
        serialize(ref) {
            return ref instanceof PolymorphicRef
                ? { model: ref.Model.name, id: ref.id }
                : ref;
        },
        validate(value, result) {
            if (!(value instanceof PolymorphicRef)) {
                result.addError('invalid_type', 'Expected a polymorphic reference');
            }
        },
    };
}
export class PolymorphicRef extends Ref {
    constructor(Model, id) {
        super(Model, id);
        Object.defineProperty(this, 'cache', { enumerable: false });
    }
    async get() {
        if (this.cache !== undefined) {
            return this.cache;
        }
        const query = this.Model.query();
        const model = await query.get(this.id);
        this.cache = model;
        return model;
    }
}
export function isPolymorphicRef(value) {
    return value instanceof PolymorphicRef;
}
export default polymorphicRef;
