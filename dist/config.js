/**
 * Configuration management for variance analysis application
 */
import dotenv from 'dotenv';
// Load environment variables
dotenv.config();
export class Config {
    // Excel constants
    static EXCEL_SHEET_NAME_MAX_LENGTH = 31;
    static INVALID_SHEET_NAME_CHARS = ['\\', '/', '*', '?', ':', '[', ']'];
    static COLOR_YELLOW = 'FFFFFF00';
    static COLOR_GREEN = 'FF00B050';
    static COLOR_RED = 'FFFF0000';
    // Column names
    static COLUMN_NAME_DIFFERENCE = 'Difference';
    static COLUMN_NAME_CELL_REF = 'Cell Reference';
    // Table style
    static TABLE_STYLE_NAME = 'TableStyleMedium9';
    // Document properties
    static EXCEL_AUTHOR = process.env.EXCEL_AUTHOR || '';
    static EXCEL_TITLE = process.env.EXCEL_TITLE || '';
    static EXCEL_CATEGORY = process.env.EXCEL_CATEGORY || '';
    /**
     * Get environment variable with whitespace stripping
     */
    static getEnv(key, defaultValue = '') {
        const value = process.env[key] || defaultValue;
        return value.trim().replace(/^["']|["']$/g, '');
    }
    /**
     * Get authentication configuration from environment variables
     */
    static getAuthConfig() {
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
    static getApiConfig() {
        const baseUrl = this.getEnv('API_BASE_URL', 'https://example.com/api');
        return {
            baseUrl,
            returnsEndpoint: `${baseUrl}/returns`,
            analysisEndpoint: `${baseUrl}/analysis/cellAnalyses`,
        };
    }
}
//# sourceMappingURL=config.js.map