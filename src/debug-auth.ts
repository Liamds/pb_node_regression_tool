/**
 * Debug authentication issues with AgileReporter API
 */

import axios from 'axios';
import https from 'https';
import { Config } from './config.js';

interface TestResult {
  [key: string]: boolean;
}

/**
 * Test basic authentication without extra headers
 */
async function testAuthenticationBasic(): Promise<boolean> {
  console.log('='.repeat(80));
  console.log('TEST 1: Basic Authentication (original method)');
  console.log('='.repeat(80));

  const config = Config.getAuthConfig();

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const data = new URLSearchParams({
    username: config.username,
    password: config.password,
    grant_type: config.grantType,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  try {
    console.log(`Attempting to authenticate to: ${config.url}`);
    console.log(`Username: ${config.username}`);
    console.log(`Password: ${config.password}`);
    console.log(`Grant type: ${config.grantType}`);
    console.log(`Client ID: ${config.clientId}`);
    console.log(`Client Secret: ${config.clientSecret}`);

    const response = await axios.post(config.url, data.toString(), {
      headers,
      timeout: 30000,
    });

    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, response.headers);
    console.log(`Response body (first 500 chars):`, JSON.stringify(response.data).substring(0, 500));

    if (response.status === 200) {
      const token = response.data.access_token;
      if (token) {
        console.log(`✓ SUCCESS - Token received (length: ${token.length})`);
        return true;
      } else {
        console.log('✗ FAILED - No access_token in response');
        return false;
      }
    } else {
      console.log(`✗ FAILED - Status code: ${response.status}`);
      console.log(`Response:`, response.data);
      return false;
    }
  } catch (error: any) {
    console.log(`✗ EXCEPTION:`, error.message);
    if (error.response) {
      console.log(`Response status: ${error.response.status}`);
      console.log(`Response data:`, error.response.data);
    }
    return false;
  }
}

/**
 * Test authentication with browser-like headers
 */
async function testAuthenticationBrowserLike(): Promise<boolean> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Browser-like Authentication (with User-Agent, etc.)');
  console.log('='.repeat(80));

  const config = Config.getAuthConfig();

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Origin': 'https://policebank-uat.agilereporter.com',
    'Referer': 'https://policebank-uat.agilereporter.com/',
  };

  const data = new URLSearchParams({
    username: config.username,
    password: config.password,
    grant_type: config.grantType,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  try {
    console.log(`Attempting to authenticate to: ${config.url}`);
    console.log('Using browser-like headers');

    const response = await axios.post(config.url, data.toString(), {
      headers,
      timeout: 30000,
    });

    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, response.headers);
    console.log(`Response body (first 500 chars):`, JSON.stringify(response.data).substring(0, 500));

    if (response.status === 200) {
      const token = response.data.access_token;
      if (token) {
        console.log(`✓ SUCCESS - Token received (length: ${token.length})`);
        return true;
      } else {
        console.log('✗ FAILED - No access_token in response');
        return false;
      }
    } else {
      console.log(`✗ FAILED - Status code: ${response.status}`);
      console.log(`Response:`, response.data);
      return false;
    }
  } catch (error: any) {
    console.log(`✗ EXCEPTION:`, error.message);
    if (error.response) {
      console.log(`Response status: ${error.response.status}`);
      console.log(`Response data:`, error.response.data);
    }
    return false;
  }
}

/**
 * Test with SSL verification disabled
 */
async function testWithVerifyFalse(): Promise<boolean> {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: With SSL Verification Disabled');
  console.log('='.repeat(80));
  console.log('⚠️  This is for debugging only - not recommended for production!');

  const config = Config.getAuthConfig();

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  const data = new URLSearchParams({
    username: config.username,
    password: config.password,
    grant_type: config.grantType,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  try {
    const response = await axios.post(config.url, data.toString(), {
      headers,
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });

    console.log(`Response status: ${response.status}`);

    if (response.status === 200) {
      const token = response.data.access_token;
      if (token) {
        console.log(`✓ SUCCESS - Token received`);
        return true;
      } else {
        console.log('✗ FAILED - No access_token in response');
        return false;
      }
    } else {
      console.log(`✗ FAILED - Status code: ${response.status}`);
      console.log(`Response:`, response.data);
      return false;
    }
  } catch (error: any) {
    console.log(`✗ EXCEPTION:`, error.message);
    if (error.response) {
      console.log(`Response status: ${error.response.status}`);
      console.log(`Response data:`, error.response.data);
    }
    return false;
  }
}

/**
 * Run all authentication tests
 */
async function main(): Promise<void> {
  console.log('AgileReporter Authentication Debugging Tool');
  console.log('='.repeat(80));

  const results: TestResult = {
    Basic: await testAuthenticationBasic(),
    'Browser-like': await testAuthenticationBrowserLike(),
    'SSL Disabled': await testWithVerifyFalse(),
  };

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  for (const [testName, success] of Object.entries(results)) {
    const status = success ? '✓ PASSED' : '✗ FAILED';
    console.log(`${testName.padEnd(20)}: ${status}`);
  }

  if (Object.values(results).some((v) => v)) {
    console.log('\n✓ At least one method worked!');
    console.log('Update api-client.ts to use the successful method.');
  } else {
    console.log('\n✗ All methods failed!');
    console.log('Possible issues:');
    console.log('  1. Check credentials in .env file');
    console.log('  2. Verify network connectivity');
    console.log('  3. Check if IP is whitelisted');
    console.log('  4. Verify the auth URL is correct');
    console.log('  5. Check if credentials work in browser');
  }
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});