const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// Helper to run shell command safely and inherit stdio
function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: rootDir, stdio: 'inherit', ...opts });
}

function runCapture(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', ...opts }).trim();
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('====================================================');
  console.log('🚀 Digital Dashboard — Git & Deploy ("Ship") Workflow');
  console.log('====================================================\n');

  const rawArgs = process.argv.slice(2);
  let commitMsg = '';
  let deployTarget = '--cms'; // default to cms

  // Parse arguments
  for (const arg of rawArgs) {
    if (['--all', '--cms', '--tv', '--backend'].includes(arg)) {
      deployTarget = arg;
    } else if (!commitMsg) {
      commitMsg = arg;
    }
  }

  if (!commitMsg) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    commitMsg = `chore: update and deploy [${timestamp}]`;
  }

  // ----------------------------------------------------
  // STEP 1: Git Stage & Commit
  // ----------------------------------------------------
  console.log('📌 [1/3] Checking Git working tree...');
  const isGitRepo = runCapture('git rev-parse --is-inside-work-tree') === 'true';

  if (!isGitRepo) {
    console.log('⚡ Initializing local Git repository (main branch)...');
    run('git init -b main');
  }

  const gitStatus = runCapture('git status --porcelain');
  if (gitStatus && gitStatus.length > 0) {
    console.log(`📝 Staging changes and committing: "${commitMsg}"...`);
    run('git add .');
    run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
    console.log('✅ Git commit created successfully.');
  } else {
    console.log('ℹ️ Working tree is clean. Nothing new to commit.');
  }

  // ----------------------------------------------------
  // STEP 2: Git Push (if remote configured)
  // ----------------------------------------------------
  console.log('\n📌 [2/3] Checking remote Git repository...');
  const currentBranch = runCapture('git branch --show-current') || 'main';
  const remotes = runCapture('git remote');

  if (remotes && remotes.includes('origin')) {
    console.log(`📡 Pushing to origin/${currentBranch}...`);
    try {
      run(`git push origin ${currentBranch}`);
      console.log('✅ Pushed changes to remote Git repository.');
    } catch (err) {
      console.warn('⚠️ Push to origin failed. Check credentials or remote branch status.');
    }
  } else {
    console.log('ℹ️ No remote "origin" configured yet.');
    console.log('👉 To link to GitHub/GitLab:');
    console.log('   git remote add origin <your-repo-url>');
    console.log('   git push -u origin ' + currentBranch);
  }

  // ----------------------------------------------------
  // STEP 3: Deploy to Hostever (sbmoffice.net)
  // ----------------------------------------------------
  console.log(`\n📌 [3/3] Triggering Hostever Deployment (${deployTarget})...`);
  run(`node scripts/deploy.js ${deployTarget}`);
}

main().catch((err) => {
  console.error('\n❌ Ship workflow failed:', err.message);
  process.exit(1);
});
