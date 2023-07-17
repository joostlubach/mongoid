export default function virtual(options = {}) {
    return {
        name: 'virtual',
        options: {
            required: false,
            virtual: true,
        },
        coerce(value) {
            return value;
        },
        serialize(value, parent) {
            if (options.get && parent != null) {
                return options.get(parent);
            }
            else {
                return value;
            }
        },
        validate() {
            // No-op
        },
    };
}
export function isVirtual(type) {
    return !!type.options.virtual;
}
