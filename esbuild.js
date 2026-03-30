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
			external: ['vscode', '@modelcontextprotocol/sdk', '@a2a-js/sdk', 'eslint', 'jiti', 'jiti/package.json'],
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

		// Inline codicon.ttf as base64 data URI into codicon.css
		// This avoids relative path resolution issues in macOS WKWebView
		const codiconCssPath = 'node_modules/@vscode/codicons/dist/codicon.css';
		const codiconTtfPath = 'node_modules/@vscode/codicons/dist/codicon.ttf';
		let codiconCss = fs.readFileSync(codiconCssPath, 'utf8');
		const codiconTtfBase64 = fs.readFileSync(codiconTtfPath).toString('base64');
		const dataUri = `data:font/truetype;charset=utf-8;base64,${codiconTtfBase64}`;
		// Replace the font URL (with or without query string) with the data URI
		codiconCss = codiconCss.replace(/url\(["']?\.\/codicon\.ttf[^"')]*["']?\)/g, `url("${dataUri}")`);
		fs.writeFileSync('dist/codicon.css', codiconCss);
		console.log('Codicon CSS with inlined font created successfully!');


		console.log('Build successful!');

	} catch (err) {
		console.error("Build failed:", err);
		process.exit(1);
	}
}

main();