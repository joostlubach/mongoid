type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
declare type AnyObject = Record<any, any>