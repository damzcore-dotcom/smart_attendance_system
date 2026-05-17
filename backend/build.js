const esbuild = require('esbuild');
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');

async function build() {
  console.log('📦 Starting Backend Compilation...');
  
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  try {
    // Step 1: Bundle all source code into one file using esbuild
    // We mark everything in node_modules as external to avoid native module issues
    await esbuild.build({
      entryPoints: ['src/index.js'],
      bundle: true,
      outfile: 'dist/bundle.js',
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      external: [
        'express', 
        '@prisma/client', 
        'cors', 
        'dotenv', 
        'jsonwebtoken', 
        'bcryptjs', 
        'multer', 
        'node-cron', 
        'node-zklib', 
        'xlsx',
        'crypto'
      ],
      minify: false, // We will use obfuscator next
    });

    console.log('✅ Bundle created successfully.');

    // Step 2: Obfuscate the bundled code
    console.log('🔒 Obfuscating source code...');
    const bundledCode = fs.readFileSync(path.join(distDir, 'bundle.js'), 'utf8');

    const obfuscationResult = JavaScriptObfuscator.obfuscate(bundledCode, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      debugProtection: false, // Don't use in dev, but can enable for prod
      disableConsoleOutput: false,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: true,
      renameGlobals: false,
      selfDefending: true,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 10,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayCallsTransformThreshold: 0.5,
      stringArrayEncoding: ['rc4'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 1,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 2,
      stringArrayWrappersType: 'variable',
      stringArrayThreshold: 0.75,
      unicodeEscapeSequence: false
    });

    fs.writeFileSync(path.join(distDir, 'index.js'), obfuscationResult.getObfuscatedCode());
    
    // Clean up temporary bundle
    fs.unlinkSync(path.join(distDir, 'bundle.js'));

    console.log('✅ Obfuscation complete.');
    console.log('\n================================================================');
    console.log('🎉 BUILD SUCCESSFUL');
    console.log('Your secured backend is located at: backend/dist/index.js');
    console.log('To run the secured version: node dist/index.js');
    console.log('================================================================\n');
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

build();
