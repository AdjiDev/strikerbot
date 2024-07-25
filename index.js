const { spawn } = require('child_process');
const path = require('path');

const mainScriptPath = path.join(__dirname, 'main.js');

const child = spawn('node', [mainScriptPath, '--pairing'], {
    stdio: 'inherit'
});

child.on('error', (error) => {
    console.error(`Error: ${error.message}`);
});

child.on('close', (code) => {
    console.log(`Child process exited with code ${code}`);
});
