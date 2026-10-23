import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'NEXT_PUBLIC_SUPABASE_')

  return {
    plugins: [react()],
    root: resolve(__dirname, 'native'),
    base: './',
    define: {
      __SUPABASE_URL__: JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL),
      __SUPABASE_ANON_KEY__: JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
    build: {
      outDir: resolve(__dirname, 'out'),
      emptyOutDir: true,
    },
  }
})