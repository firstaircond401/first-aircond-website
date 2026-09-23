// scripts/create-admin.js
//
// Run this once (npm run setup) to create your admin login.
// It asks for a username and password, hashes the password with bcrypt,
// and writes both into the .env file. The plain password is never stored
// anywhere - only the hash is.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');

const ENV_PATH = path.join(__dirname, '..', '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Basic hidden-input prompt for the password so it doesn't echo to the
// terminal. Works in standard terminals without extra dependencies.
function askHidden(query) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(query);
    let input = '';
    const onData = (char) => {
      char = char.toString('utf8');
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write('\n');
        resolve(input);
      } else if (char === '\u0003') {
        process.exit(1);
      } else if (char === '\u007f') {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

function ask(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log('--- First Air Cond admin setup ---');
  console.log('This creates the login used at /admin/login\n');

  const username = (await ask('Choose an admin username: ')).trim();
  if (!username) {
    console.log('Username cannot be empty.');
    process.exit(1);
  }

  let password = '';
  if (process.stdin.isTTY) {
    password = await askHidden('Choose an admin password (input hidden): ');
  } else {
    password = await ask('Choose an admin password: ');
  }
  if (!password || password.length < 8) {
    console.log('Password must be at least 8 characters.');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(password, 12);
  const sessionSecret = require('crypto').randomBytes(32).toString('hex');

  let envContent = '';
  if (fs.existsSync(ENV_PATH)) {
    envContent = fs.readFileSync(ENV_PATH, 'utf8');
  } else if (fs.existsSync(path.join(__dirname, '..', '.env.example'))) {
    envContent = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  }

  envContent = setEnvVar(envContent, 'ADMIN_USERNAME', username);
  envContent = setEnvVar(envContent, 'ADMIN_PASSWORD_HASH', hash);
  if (!/^SESSION_SECRET=.+$/m.test(envContent)) {
    envContent = setEnvVar(envContent, 'SESSION_SECRET', sessionSecret);
  }
  if (!/^PORT=.+$/m.test(envContent)) {
    envContent = setEnvVar(envContent, 'PORT', '3000');
  }

  fs.writeFileSync(ENV_PATH, envContent.trim() + '\n');
  console.log('\nSaved to .env. You can now log in at /admin/login with that username and password.');
  rl.close();
}

function setEnvVar(content, key, value) {
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  return content ? `${content.trim()}\n${line}\n` : `${line}\n`;
}

main();
