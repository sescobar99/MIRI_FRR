import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        outDir: 'docs' // Normalmente el build se llevaria al directorio dist/ pero github pages solo permite servir contenido desde la raiz o desde docs/ ()
    },
    base: '/MIRI_FRR/', // Sirve para que githubpages pueda resolver correctamente los imports
})