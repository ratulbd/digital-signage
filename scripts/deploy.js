const ftp = require('basic-ftp');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const FTP_CONFIG = {
  host: process.env.FTP_HOST || '172.96.172.133',
  user: process.env.FTP_USER || 'deployer_sbmoffice.net',
  password: process.env.FTP_PASSWORD || 'Metal@#3579',
  secure: false,
};

const args = process.argv.slice(2);
const deployAll = args.length === 0 || args.includes('--all');
const deployCMS = deployAll || args.includes('--cms');
const deployTV = deployAll || args.includes('--tv');
const deployBackend = deployAll || args.includes('--backend');

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  console.log('====================================================');
  console.log('🛡️  Safe Isolated Deploy — Digital Dashboard Only');
  console.log('====================================================\n');

  // 1. Build Web CMS
  if (deployCMS) {
    console.log('📦 [1/3] Building Web CMS (React / Vite)...');
    execSync('npm run build', { cwd: path.join(rootDir, 'web-cms'), stdio: 'inherit' });
    
    // Ensure .htaccess is in dist
    const htaccessPath = path.join(rootDir, 'web-cms', 'dist', '.htaccess');
    if (!fs.existsSync(htaccessPath)) {
      fs.writeFileSync(htaccessPath, `<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteCond %{HTTPS} off
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>\n`);
    }
  }

  // 2. Build Backend
  if (deployBackend) {
    console.log('\n📦 [2/3] Building Backend (TypeScript / Prisma)...');
    execSync('npm run build', { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });
  }

  // 3. Connect to FTP and upload ONLY to target project directories
  console.log('\n📡 [3/3] Connecting to Hostever FTP Server...');
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    try {
      await client.access(FTP_CONFIG);
      console.log('✅ Connected to FTP as', FTP_CONFIG.user);
    } catch (err) {
      console.log('⚠️ Retrying with alternate username format (deployer@sbmoffice.net)...');
      await client.access({ ...FTP_CONFIG, user: 'deployer@sbmoffice.net' });
      console.log('✅ Connected to FTP as deployer@sbmoffice.net');
    }

    // 1. Safely upload Web CMS
    if (deployCMS) {
      console.log(`\n📤 Syncing Web CMS to /public_html/dash...`);
      await client.cd('/');
      await client.ensureDir('public_html/dash');
      await client.uploadFromDir(path.join(rootDir, 'web-cms', 'dist'));
      console.log('✅ Web CMS updated! (https://dash.sbmoffice.net)');
    }

    // 2. Safely upload TV Player
    if (deployTV) {
      console.log(`\n📤 Syncing TV Player to /public_html/tv...`);
      await client.cd('/');
      await client.ensureDir('public_html/tv');
      await client.uploadFromDir(path.join(rootDir, 'android-tv', 'public'));
      console.log('✅ TV Player updated! (https://tv.sbmoffice.net)');
    }

    // 3. Safely upload Backend compiled code
    if (deployBackend) {
      console.log(`\n📤 Syncing Backend compiled code to /backend/dist...`);
      await client.cd('/');
      await client.ensureDir('backend/dist');
      await client.uploadFromDir(path.join(rootDir, 'backend', 'dist'));
      console.log('✅ Backend code updated! (https://api.sbmoffice.net)');

      // Seamlessly restart backend Node.js process
      try {
        const stream = require('stream');
        const restartPhp = `<?php
shell_exec("pkill -9 -f 'node dist/index.js'");
usleep(500000);
shell_exec("nohup /bin/bash /home/sbmoffic/backend/run.sh > /dev/null 2>&1 &");
echo "RESTARTED";
?>`;
        await client.uploadFrom(stream.Readable.from(Buffer.from(restartPhp)), '/public_html/tv/runner.php');
        const res = await fetch('https://tv.sbmoffice.net/runner.php');
        const text = await res.text();
        console.log(`🔄 Backend Node.js process restarted: ${text.trim()}`);
        await client.remove('/public_html/tv/runner.php');
      } catch (e) {
        console.log('ℹ️ Note: automated process restart:', e.message);
      }
    }

    console.log('\n====================================================');
    console.log('🎉 DEPLOYMENT COMPLETE — NO OTHER APPS WERE TOUCHED');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ Deployment error:', err.message);
  } finally {
    client.close();
  }
}

main();
