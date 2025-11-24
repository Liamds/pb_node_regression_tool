/**
 * Check environment variables and configuration loading
 */

import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { Config } from './config.js';

console.log('='.repeat(80));
console.log('ENVIRONMENT VARIABLE CHECKER');
console.log('='.repeat(80));

// Check if .env file exists
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) {
  console.log(`✓ .env file found at: ${envFile}`);
} else {
  console.log(`✗ .env file NOT found at: ${envFile}`);
  console.log('\nPlease create a .env file from .env.example');
  process.exit(1);
}

// Load the .env file
dotenv.config();

console.log('\n' + '='.repeat(80));
console.log('RAW ENVIRONMENT VARIABLES');
console.log('='.repeat(80));

// Check each variable
const variables = [
  'AUTH_URL',
  'APRA_USERNAME',
  'PASSWORD',
  'GRANT_TYPE',
  'CLIENT_ID',
  'CLIENT_SECRET',
  'API_BASE_URL',
];

for (const varName of variables) {
  const value = process.env[varName];

  if (value) {
    // Show length and first/last few chars for sensitive data
    let display: string;
    if (varName === 'PASSWORD' || varName === 'CLIENT_SECRET') {
      display = value.length > 6 ? `${value.slice(0, 3)}...${value.slice(-3)}` : '***';
      console.log(`${varName.padEnd(20)}: ${display} (length: ${value.length})`);
    } else {
      console.log(`${varName.padEnd(20)}: ${value}`);
    }

    // Check for common issues
    if (value !== value.trim()) {
      console.log('  ⚠️  WARNING: Value has leading/trailing whitespace!');
    }
    if (value.startsWith('"') || value.startsWith("'")) {
      console.log('  ⚠️  WARNING: Value appears to be quoted!');
    }
  } else {
    console.log(`${varName.padEnd(20)}: ✗ NOT SET`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('CLEANED VALUES (after stripping)');
console.log('='.repeat(80));

function cleanValue(key: string): string {
  const value = process.env[key] || '';
  return value.trim().replace(/^["']|["']$/g, '');
}

for (const varName of variables) {
  const value = cleanValue(varName);

  if (value) {
    let display: string;
    if (varName === 'PASSWORD' || varName === 'CLIENT_SECRET') {
      display = value.length > 6 ? `${value.slice(0, 3)}...${value.slice(-3)}` : '***';
      console.log(`${varName.padEnd(20)}: ${display} (length: ${value.length})`);
    } else {
      console.log(`${varName.padEnd(20)}: ${value}`);
    }
  } else {
    console.log(`${varName.padEnd(20)}: ✗ NOT SET`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('TESTING CONFIG LOADING');
console.log('='.repeat(80));

try {
  const authConfig = Config.getAuthConfig();
  const apiConfig = Config.getApiConfig();

  console.log('\nAuthConfig:');
  console.log(`  url: ${authConfig.url}`);
  console.log(`  username: ${authConfig.username}`);
  console.log(`  password: ${'*'.repeat(authConfig.password.length)} (length: ${authConfig.password.length})`);
  console.log(`  grantType: ${authConfig.grantType}`);
  console.log(`  clientId: ${authConfig.clientId}`);
  console.log(`  clientSecret: ${authConfig.clientSecret.slice(0, 8)}... (length: ${authConfig.clientSecret.length})`);

  console.log('\nAPIConfig:');
  console.log(`  baseUrl: ${apiConfig.baseUrl}`);
  console.log(`  returnsEndpoint: ${apiConfig.returnsEndpoint}`);
  console.log(`  analysisEndpoint: ${apiConfig.analysisEndpoint}`);

  console.log('\n✓ Config loaded successfully!');

  // Compare with hardcoded values
  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON WITH HARDCODED VALUES');
  console.log('='.repeat(80));

  const expected: Record<string, string> = {
    username: 'ldyersteel@policebank.com.au',
    grantType: 'password',
    clientId: 'AgileREPORTER',
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = authConfig[key as keyof typeof authConfig];
    const match = actualValue === expectedValue ? '✓ MATCH' : '✗ MISMATCH';
    console.log(`${key.padEnd(15)}: ${match}`);

    if (actualValue !== expectedValue) {
      console.log(`  Expected: '${expectedValue}'`);
      console.log(`  Got:      '${actualValue}'`);
      console.log(`  Lengths:  ${expectedValue.length} vs ${String(actualValue).length}`);

      // Show byte-by-byte comparison for first mismatch
      for (let i = 0; i < Math.min(expectedValue.length, String(actualValue).length); i++) {
        if (expectedValue[i] !== String(actualValue)[i]) {
          console.log(
            `  First diff at position ${i}: expected '${expectedValue[i]}' (code=${expectedValue.charCodeAt(i)}), got '${String(actualValue)[i]}' (code=${String(actualValue).charCodeAt(i)})`
          );
          break;
        }
      }
    }
  }
} catch (error: any) {
  console.log(`\n✗ Error loading config: ${error.message}`);
  console.error(error);
}

console.log('\n' + '='.repeat(80));
console.log('RECOMMENDATIONS');
console.log('='.repeat(80));

console.log(`
1. Ensure your .env file has no extra spaces around the = sign
2. Do NOT quote values (no " or ')
3. Ensure there are no trailing spaces
4. Use Unix line endings (LF, not CRLF)

Good example:
APRA_USERNAME=ldyersteel@policebank.com.au
PASSWORD=your_password

Bad examples:
APRA_USERNAME = ldyersteel@policebank.com.au    (spaces around =)
APRA_USERNAME="ldyersteel@policebank.com.au"   (quoted)
APRA_USERNAME=ldyersteel@policebank.com.au     (trailing space)
`);

console.log('\n' + '='.repeat(80));
console.log('READY TO TEST');
console.log('='.repeat(80));
console.log('\nIf all values look correct above, try running:');
console.log('  npm run debug-auth');
console.log('\nThis will test authentication with your loaded configuration.');