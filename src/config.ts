/**
 * Configuration management for variance analysis application
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface AuthConfig {
  url: string;
  username: string;
  password: string;
  grantType: string;
  clientId: string;
  clientSecret: string;
}

export interface APIConfig {
  baseUrl: string;
  returnsEndpoint: string;
  analysisEndpoint: string;
}

export class Config {
  // Excel constants
  static readonly EXCEL_SHEET_NAME_MAX_LENGTH = 31;
  static readonly INVALID_SHEET_NAME_CHARS = ['\\', '/', '*', '?', ':', '[', ']'];
  static readonly COLOR_YELLOW = 'FFFFFF00';
  static readonly COLOR_GREEN = 'FF00B050';
  static readonly COLOR_RED = 'FFFF0000';

  // Column names
  static readonly COLUMN_NAME_DIFFERENCE = 'Difference';
  static readonly COLUMN_NAME_CELL_REF = 'Cell Reference';

  // Table style
  static readonly TABLE_STYLE_NAME = 'TableStyleMedium9';

  // Document properties
  static readonly EXCEL_AUTHOR = process.env.EXCEL_AUTHOR || '';
  static readonly EXCEL_TITLE = process.env.EXCEL_TITLE || '';
  static readonly EXCEL_CATEGORY = process.env.EXCEL_CATEGORY || '';

  /**
   * Get environment variable with whitespace stripping
   */
  private static getEnv(key: string, defaultValue: string = ''): string {
    const value = process.env[key] || defaultValue;
    return value.trim().replace(/^["']|["']$/g, '');
  }

  /**
   * Get authentication configuration from environment variables
   */
  static getAuthConfig(): AuthConfig {
    return {
      url: this.getEnv('AUTH_URL', 'https://example.com/token'),
      username: this.getEnv('APRA_USERNAME', ''),
      password: this.getEnv('PASSWORD', ''),
      grantType: this.getEnv('GRANT_TYPE', ''),
      clientId: this.getEnv('CLIENT_ID', ''),
      clientSecret: this.getEnv('CLIENT_SECRET', ''),
    };
  }

  /**
   * Get API configuration from environment variables
   */
  static getApiConfig(): APIConfig {
    const baseUrl = this.getEnv('API_BASE_URL', 'https://example.com/api');
    return {
      baseUrl,
      returnsEndpoint: `${baseUrl}/returns`,
      analysisEndpoint: `${baseUrl}/analysis/cellAnalyses`,
    };
  }
}