const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../frontend/dist');
const destDir = path.join(__dirname, '../dist');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  if (fs.existsSync(srcDir)) {
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    copyDir(srcDir, destDir);
    console.log(`Copied build from ${srcDir} to ${destDir}`);
  } else {
    console.error(`Source directory ${srcDir} does not exist.`);
    process.exit(1);
  }
} catch (err) {
  console.error('Error copying build directory:', err);
  process.exit(1);
}
