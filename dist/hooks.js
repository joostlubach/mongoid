import Model from './Model';
const HOOKS = new Map();
export function registerHook(Model, name, hook) {
    let hooksForModel = HOOKS.get(Model);
    if (hooksForModel == null) {
        HOOKS.set(Model, hooksForModel = {
            beforeValidate: new Set(),
            beforeSave: new Set(),
            afterSave: new Set(),
            beforeDelete: new Set(),
            afterDelete: new Set(),
        });
    }
    const hooks = hooksForModel[name];
    hooks.add(hook);
}
export async function callHook(model, name, ...args) {
    const Model = model.constructor;
    const hooks = resolveHooks(Model, name);
    for (const hook of hooks) {
        await hook.call(model, ...args);
    }
    return hooks.length > 0;
}
export function getHooks(Class) {
    return HOOKS.get(Class) ?? null;
}
export function resolveHooks(Class, name) {
    if (!(Class.prototype instanceof Model)) {
        return [];
    }
    const superPrototype = Object.getPrototypeOf(Class.prototype);
    const SuperClass = superPrototype && superPrototype.constructor;
    const hooksForClass = HOOKS.get(Class);
    if (hooksForClass == null) {
        return resolveHooks(SuperClass, name);
    }
    else {
        return [...hooksForClass[name], ...resolveHooks(SuperClass, name)];
    }
}
// Decorator
export function hook(name) {
    return (prototype, key) => {
        const Model = prototype.constructor;
        registerHook(Model, name, prototype[key]);
    };
}
