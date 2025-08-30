import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	build: {
		outDir: 'build',
		rollupOptions: {
			output: {
				// [수정됨] banner 옵션을 output 안으로 이동했습니다.
				banner: `/* BUILD SUCCESSFUL: ${new Date().toLocaleString()} */`,
				entryFileNames: `assets/[name].js`,
				chunkFileNames: `assets/[name].js`,
				assetFileNames: `assets/[name].[ext]`
			}
		}
	}
})