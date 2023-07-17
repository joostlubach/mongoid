import { Type, TypeOptions } from 'validator';
interface Options {
    get?: (item: any) => any;
}
export default function virtual(options?: TypeOptions<any> & Options): Type<any>;
export declare function isVirtual(type: Type<any>): boolean;
export {};
