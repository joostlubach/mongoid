export declare function withClientStackTrace<T>(fn: () => PromiseLike<T> | T): Promise<T>;
export declare function deepMapKeys(arg: any, fn: (key: string | symbol) => any): any;
