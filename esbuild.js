const esbuild = require("esbuild");
const fs = require('fs-extra'); // fs-extra를 사용하기 위해 추가

const production = process.argv.includes('--production');

async function main() {
	const sharedConfig = {
		bundle: true,
		minify: production,
		sourcemap: !production,
		logLevel: 'info',
	};

	try {
		// Backend build
		await esbuild.build({
			...sharedConfig,
			entryPoints: ['src/extension.ts'],
			format: 'cjs',
			platform: 'node',
			outfile: 'dist/extension.js',
			external: ['vscode'],
		});

		// Frontend build
		await esbuild.build({
			...sharedConfig,
			entryPoints: {
				main: 'src/vs/ai-partner/ui/index.tsx'
			},
			format: 'esm',
			platform: 'browser',
			outdir: 'dist',
		});

		// --- 추가된 부분 시작 ---
		// media 폴더를 dist 폴더로 복사합니다.
		fs.copySync('media', 'dist/media', { overwrite: true });
		console.log('Media assets copied successfully!');
		// --- 추가된 부분 끝 ---

		fs.copySync('node_modules/@vscode/codicons/dist/codicon.css', 'dist/codicon.css', { overwrite: true });
		fs.copySync('node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/codicon.ttf', { overwrite: true });
		console.log('Codicon assets copied successfully!');


		console.log('Build successful!');

	} catch (err) {
		console.error("Build failed:", err);
		process.exit(1);
	}
}

main();