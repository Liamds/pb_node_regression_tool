/**
 * Configuration management for variance analysis application
 */
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
export declare class Config {
    static readonly EXCEL_SHEET_NAME_MAX_LENGTH = 31;
    static readonly INVALID_SHEET_NAME_CHARS: string[];
    static readonly COLOR_YELLOW = "FFFFFF00";
    static readonly COLOR_GREEN = "FF00B050";
    static readonly COLOR_RED = "FFFF0000";
    static readonly COLUMN_NAME_DIFFERENCE = "Difference";
    static readonly COLUMN_NAME_CELL_REF = "Cell Reference";
    static readonly TABLE_STYLE_NAME = "TableStyleMedium9";
    static readonly EXCEL_AUTHOR: string;
    static readonly EXCEL_TITLE: string;
    static readonly EXCEL_CATEGORY: string;
    /**
     * Get environment variable with whitespace stripping
     */
    private static getEnv;
    /**
     * Get authentication configuration from environment variables
     */
    static getAuthConfig(): AuthConfig;
    /**
     * Get API configuration from environment variables
     */
    static getApiConfig(): APIConfig;
}
//# sourceMappingURL=config.d.ts.map