import { getHooks, registerHook } from './hooks';
export const CONFIGS = new WeakMap();
export function trait(schema, Mixin, defaultConfig) {
    const fn = (Base, config = {}) => {
        class Extended extends Base {
        }
        mixin(Extended, Mixin);
        registerHooks(Extended, Mixin);
        CONFIGS.set(Extended, [fn, { ...defaultConfig, ...config }]);
        return Extended;
    };
    fn.schema = schema;
    fn.config = (Target) => {
        for (let C = Target; C != null; C = C.__proto__) {
            if (!CONFIGS.has(C)) {
                continue;
            }
            const [trait, config] = CONFIGS.get(C);
            if (trait !== fn) {
                continue;
            }
            return config;
        }
        return defaultConfig;
    };
    return fn;
}
function mixin(Target, Mixin) {
    for (const name of Object.getOwnPropertyNames(Mixin.prototype)) {
        if (name === 'constructor') {
            continue;
        }
        Target.prototype[name] = Mixin.prototype[name];
    }
    for (const symbol of Object.getOwnPropertySymbols(Mixin.prototype)) {
        Target.prototype[symbol] = Mixin.prototype[symbol];
    }
    for (const name of Object.getOwnPropertyNames(Mixin)) {
        if (['name', 'prototype', 'length'].includes(name)) {
            continue;
        }
        Target[name] = Mixin[name];
    }
    for (const symbol of Object.getOwnPropertySymbols(Mixin)) {
        Target[symbol] = Mixin[symbol];
    }
}
function registerHooks(Target, Mixin) {
    const mixinHooks = getHooks(Mixin);
    if (mixinHooks == null) {
        return;
    }
    for (const [name, hooks] of Object.entries(mixinHooks)) {
        for (const hook of hooks) {
            registerHook(Target, name, hook);
        }
    }
}
