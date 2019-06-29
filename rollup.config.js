import typescript from 'rollup-plugin-typescript';
import { terser } from "rollup-plugin-terser";
import pkg from './package.json';

export default {
    input: './src/html.ts',
    output: [
        {
            file: pkg.main,
            format: 'cjs',
        },
        {
            file: pkg.module,
            format: 'es',
        },
    ],
    plugins: [typescript(), terser()],
};
