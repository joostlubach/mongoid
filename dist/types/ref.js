import { isFunction, isPlainObject, omit, uniq } from 'lodash';
import { INVALID } from 'validator';
import { isID } from '../ID';
import models from '../models';
function ref(options) {
    return {
        name: 'ref',
        options,
        coerce(value) {
            const model = models[options.model];
            if (model == null) {
                throw new ReferenceError(`Referenced model \`${options.model}\` does not exist`);
            }
            if (value instanceof Ref) {
                return value;
            }
            const foreignKey = options.foreignKey || 'id';
            const opts = options;
            const refOptions = omit(opts, 'model');
            if (isID(value)) {
                return new Ref(model, value, refOptions);
            }
            else if (typeof value === 'object' && value != null && isID(value[foreignKey])) {
                return new Ref(model, value[foreignKey], refOptions);
            }
            else {
                return INVALID;
            }
        },
        serialize(ref) {
            return ref instanceof Ref ? ref.id : ref;
        },
        validate(value, result) {
            if (value instanceof Ref) {
                return;
            }
            if (isID(value)) {
                return;
            }
            const foreignKey = options.foreignKey ?? 'id';
            if (typeof value === 'object' && isID(value[foreignKey])) {
                return;
            }
            result.addError('invalid_type', 'Expected an ID');
        },
    };
}
export class Ref {
    constructor(Model, id, options = {}) {
        this.Model = Model;
        this.id = id;
        this.foreignKey = options.foreignKey ?? 'id';
        this.include = options.include ?? 'auto';
        Object.defineProperty(this, 'cache', { enumerable: false });
    }
    Model;
    id;
    foreignKey;
    include;
    cache = undefined;
    async get() {
        return this.cache ??= await this.fetch();
    }
    getCached() {
        return this.cache;
    }
    async fetch() {
        const query = this.Model.query();
        if (this.foreignKey === 'id') {
            this.cache = await query.get(this.id);
        }
        else {
            this.cache = await query.findOne({ [this.foreignKey]: this.id });
        }
        return this.cache;
    }
    async reload() {
        await this.cache?.reload();
    }
    static async getAll(refs, cache = true) {
        if (refs.length === 0) {
            return [];
        }
        const foreignKey = refs[0].foreignKey;
        const ids = uniq(refs.map(ref => ref.id));
        const query = refs[0].Model.query();
        const models = await query.filter({ [foreignKey]: { $in: ids } }).all();
        if (cache) {
            for (const ref of refs) {
                ref.cache = models.find(model => model.id === ref.id) ?? null;
            }
        }
        return models;
    }
    static async getMap(refs) {
        const map = new Map();
        const all = await this.getAll(refs);
        for (const item of all) {
            map.set(item.id, item);
        }
        return map;
    }
    equals(other) {
        if (other.Model !== this.Model) {
            return false;
        }
        return other.id === this.id;
    }
    [Symbol.toPrimitive]() {
        return this.id;
    }
    toString() {
        return this.id;
    }
}
export function isRef(arg) {
    return arg instanceof Ref;
}
export default ref;
export function isSetStrategy(strategy) {
    return isPlainObject(strategy);
}
export function isCustomStrategy(strategy) {
    return isFunction(strategy);
}
