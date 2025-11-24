/**
 * API client for interacting with AgileReporter API
 */
import axios from 'axios';
import https from 'https';
import { logger } from './logger.js';
export class AgileReporterClient {
    authConfig;
    apiConfig;
    token = null;
    host = 'policebank-uat.agilereporter.com';
    axiosInstance;
    constructor(authConfig, apiConfig) {
        this.authConfig = authConfig;
        this.apiConfig = apiConfig;
        // Create axios instance with custom configuration
        this.axiosInstance = axios.create({
            httpsAgent: new https.Agent({
                keepAlive: true,
                maxSockets: 10,
            }),
            timeout: 1200000, // 20 minutes
        });
    }
    /**
     * Authenticate and get access token
     */
    async authenticate() {
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Connection': 'keep-alive',
        };
        console.log(this.apiConfig);
        const data = new URLSearchParams({
            username: this.authConfig.username,
            password: this.authConfig.password,
            grant_type: this.authConfig.grantType,
            client_id: this.authConfig.clientId,
            client_secret: this.authConfig.clientSecret,
        });
        try {
            logger.info('Authenticating with AgileReporter...');
            const response = await this.axiosInstance.post(this.authConfig.url, data.toString(), { headers });
            if (response.status !== 200) {
                throw new Error(`Authentication failed with status ${response.status}`);
            }
            const token = response.data.access_token;
            if (!token) {
                throw new Error('No access token in response');
            }
            this.token = token;
            logger.info('Authentication successful');
            return token;
        }
        catch (error) {
            logger.error('Authentication failed', { error });
            throw error;
        }
    }
    /**
     * Get all versions/instances of a form
     */
    async getFormVersions(formCode) {
        if (!this.token) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }
        const path = `/agilereporter/rest/api/returns?productPrefix=APRA&entityCode=PBL&formCode=${formCode}`;
        const url = `https://${this.host}${path}`;
        const headers = {
            Authorization: `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
            Connection: 'keep-alive',
        };
        try {
            logger.info(`Fetching form versions for ${formCode}`);
            const response = await this.axiosInstance.get(url, { headers });
            if (response.status !== 200) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            const instances = response.data.map((record) => ({
                instanceId: record.id,
                refDate: record.referenceDate,
            }));
            instances.sort((a, b) => a.refDate.localeCompare(b.refDate));
            logger.debug(`Retrieved ${instances.length} versions for ${formCode}`);
            return instances;
        }
        catch (error) {
            logger.error(`Failed to get form versions for ${formCode}`, { error });
            throw error;
        }
    }
    /**
     * Get metadata related to an individual cell
     */
    async getCellMetadata(instanceId, cellId) {
        if (!this.token) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }
        const path = `/agilereporter/rest/api/products/APRA/FCR_APRA/views?formInstanceId=${instanceId}&cellName=${cellId}`;
        const url = `https://${this.host}${path}`;
        const headers = {
            Authorization: `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
            Connection: 'keep-alive',
        };
        try {
            logger.info(`Fetching cell metadata for ${cellId}`);
            const response = await this.axiosInstance.get(url, { headers });
            if (response.status !== 200) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            if (!response.data || response.data.length === 0) {
                throw new Error(`No metadata found for cell ${cellId}`);
            }
            const firstRecord = response.data[0];
            const metadata = {
                id: firstRecord.id,
                physicalName: firstRecord.physicalName,
                viewCode: firstRecord.viewCode,
            };
            logger.debug(`Retrieved metadata for cell ${cellId}`);
            return metadata;
        }
        catch (error) {
            logger.error(`Failed to get cell metadata for ${cellId}`, { error });
            throw error;
        }
    }
    /**
     * Get Business Rules related to an individual cell
     */
    async getCellBusinessRules(instanceId, cell) {
        if (!this.token) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }
        const path = `/agilereporter/rest/api/products/APRA/FCR_APRA/conditions?formInstanceId=${instanceId}&viewCode=${cell.viewCode}&cellName=${cell.id}`;
        const url = `https://${this.host}${path}`;
        const headers = {
            Authorization: `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
            Connection: 'keep-alive',
        };
        try {
            logger.info(`Fetching cell business rules for ${cell.id}`);
            const response = await this.axiosInstance.get(url, { headers });
            if (response.status !== 200) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            if (!response.data || response.data.length === 0) {
                throw new Error(`No business rules found for cell ${cell.id}`);
            }
            const businessRules = response.data.map((record) => ({
                id: record.id,
                content: record.content,
                seqNumber: record.seqNumber,
            }));
            logger.debug(`Retrieved ${businessRules.length} business rules for cell ${cell.id}`);
            return businessRules;
        }
        catch (error) {
            logger.error(`Failed to get business rules for ${cell.id}`, { error });
            throw error;
        }
    }
    /**
     * Get cell headers for data for an individual cell
     */
    async getCellHeaders(instanceId, cell) {
        if (!this.token) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }
        const path = `/agilereporter/rest/api/products/APRA/FCR_APRA/allocationReportContent?page=0&size=1&cellName=${cell.id}&formInstanceId=${instanceId}&pageInstanceCode=1&viewCode=${cell.viewCode.toUpperCase()}`;
        const url = `https://${this.host}${path}`;
        const headers = {
            Authorization: `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
            Connection: 'keep-alive',
        };
        try {
            logger.info(`Fetching cell data headers for ${cell.id}`);
            const response = await this.axiosInstance.get(url, { headers });
            if (response.status !== 200) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            if (!response.data || response.data.length === 0) {
                throw new Error(`No cell data headers found for cell ${cell.id}`);
            }
            const cellHeaders = response.data.map((record) => ({
                columnName: record.columnName,
                columnLabel: record.columnLabel,
                description: record.description,
                visible: record.visible,
                columnType: record.columnType,
                valueType: record.valueType,
                highlighted: record.highlighted,
            }));
            logger.debug(`Retrieved ${cellHeaders.length} headers for cell ${cell.id}`);
            return cellHeaders;
        }
        catch (error) {
            logger.error(`Failed to get cell headers for ${cell.id}`, { error });
            throw error;
        }
    }
    /**
     * Get cell records for an individual cell and save as an XLSX file
     */
    async getCellRecordXlsx(instanceId, cell, headers, outputFile) {
        if (!this.token) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }
        let path = '/agilereporter/rest/api/products/APRA/FCR_APRA/allocationReportContent/export?';
        for (const column of headers) {
            path += `columns=${column.columnName}&`;
        }
        path += `cellName=${cell.id}&formInstanceId=${instanceId}&pageInstanceCode=1&viewCode=${cell.viewCode.toUpperCase()}`;
        const url = `https://${this.host}${path}`;
        const requestHeaders = {
            Authorization: `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
            Connection: 'keep-alive',
        };
        try {
            logger.info(`Fetching cell record data for ${cell.id}`);
            const response = await this.axiosInstance.get(url, {
                headers: requestHeaders,
                responseType: 'arraybuffer',
            });
            if (response.status !== 200) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            if (!response.data) {
                throw new Error(`No data found for cell ${cell.id}`);
            }
            // Save to file
            const fs = await import('fs/promises');
            await fs.writeFile(outputFile, response.data);
            logger.info(`Saved cell data to ${outputFile}`);
        }
        catch (error) {
            logger.error(`Failed to get cell record data for ${cell.id}`, { error });
            throw error;
        }
    }
    /**
     * Get variance analysis between two form instances
     */
    async getFormAnalysis(formCode, instance1, instance2, maxRetries = 3) {
        if (!this.token) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }
        const queryParams = new URLSearchParams({
            formInstances: `${instance1.instanceId},${instance2.instanceId}`,
            pageInstance: '1',
            constraintType: 'CELLGROUP',
            constraintId: 'ALL',
        });
        const path = `/agilereporter/rest/api/analysis/cellAnalyses?${queryParams}`;
        const url = `https://${this.host}${path}`;
        const headers = {
            Authorization: `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive',
        };
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                logger.info(`Fetching variance analysis for ${formCode} (attempt ${attempt + 1}/${maxRetries})...`);
                const response = await this.axiosInstance.get(url, {
                    headers,
                    decompress: true,
                    onDownloadProgress: (progressEvent) => {
                        if (progressEvent.total) {
                            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                            if (percentCompleted % 20 === 0) {
                                logger.debug(`Download progress: ${percentCompleted}%`);
                            }
                        }
                    },
                });
                if (response.status !== 200) {
                    throw new Error(`Request failed with status ${response.status}`);
                }
                logger.info(`Received complete response for ${formCode}`);
                const variances = this.parseVarianceRecords(response.data, instance1, instance2);
                logger.info(`Retrieved ${variances.length} variance records`);
                return variances;
            }
            catch (error) {
                logger.warn(`Connection error on attempt ${attempt + 1}`, { error: error.message });
                if (attempt < maxRetries - 1) {
                    const waitTime = 10 * (attempt + 1);
                    logger.info(`Retrying in ${waitTime} seconds...`);
                    await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
                }
                else {
                    logger.error(`Failed after ${maxRetries} attempts`);
                    throw error;
                }
            }
        }
        throw new Error(`Failed to get form analysis after ${maxRetries} attempts`);
    }
    /**
     * Validate and return results for a single form instance
     */
    async validateReturn(instance, maxRetries = 1) {
        if (!this.token) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }
        const queryParams = new URLSearchParams({
            validationResultDetails: 'true',
        });
        const path = `/agilereporter/rest/api/v1/returns/${instance.instanceId}/validation?${queryParams}`;
        const url = `https://${this.host}${path}`;
        const headers = {
            Authorization: `Bearer ${this.token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive',
        };
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                logger.info(`Fetching validation results for ${instance.instanceId} (attempt ${attempt + 1}/${maxRetries})...`);
                const response = await this.axiosInstance.put(url, null, {
                    headers,
                    decompress: true,
                    timeout: 600000, // 10 minutes
                });
                if (response.status !== 200) {
                    throw new Error(`Request failed with status ${response.status}`);
                }
                logger.info(`Received validation response for ${instance.instanceId}`);
                const validations = this.parseValidationResults(response.data, instance);
                logger.info(`Retrieved ${validations.length} validation records`);
                return validations;
            }
            catch (error) {
                logger.warn(`Connection error on attempt ${attempt + 1}`, { error: error.message });
                if (attempt < maxRetries - 1) {
                    const waitTime = 10 * (attempt + 1);
                    logger.info(`Retrying in ${waitTime} seconds...`);
                    await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
                }
                else {
                    logger.error(`Failed after ${maxRetries} attempts`);
                    throw error;
                }
            }
        }
        throw new Error(`Failed to validate return after ${maxRetries} attempts`);
    }
    /**
     * Parse variance records from API response
     */
    parseVarianceRecords(data, instance1, instance2) {
        const variances = [];
        for (const record of data) {
            const cell = record.cell;
            const cellName = cell.subtotal ? `${cell.name} (Subtotal)` : cell.name;
            const descValue = cell.description || '';
            const instances = record.instances;
            const instance1Value = instances[0].cellNotPresent ? '' : instances[0].value || '';
            const instance2Value = instances[1].cellNotPresent ? '' : instances[1].value || '';
            let diffValue;
            let diffPerc;
            if (!instances[1].difference) {
                diffValue = instances[1].value || '';
                diffPerc = '';
            }
            else {
                diffValue = instances[1].difference.valueDiff;
                diffPerc = instances[1].difference.percentageDiff;
            }
            // Skip GRID keys
            if (!/GRID\d*KEY/.test(cell.name)) {
                const variance = {
                    'Cell Reference': cellName,
                    'Cell Description': descValue,
                    [instance1.refDate]: instance1Value,
                    [instance2.refDate]: instance2Value,
                    Difference: diffValue,
                    '% Difference': diffPerc,
                };
                variances.push(variance);
            }
        }
        variances.sort((a, b) => a['Cell Reference'].localeCompare(b['Cell Reference']));
        return variances;
    }
    /**
     * Parse validation results from API response
     */
    parseValidationResults(data, instance) {
        const validationResults = [];
        const validationDetails = data.validationDetails || [];
        for (const detail of validationDetails) {
            const referencedCells = (detail.referencedCells || []).map((cellData) => ({
                cell: cellData.cell || '',
                value: cellData.value || '',
                instanceId: cellData.instanceId || '',
                pageName: cellData.pageName || '',
                form: cellData.form || '',
                referenceDate: cellData.referenceDate || '',
            }));
            const result = {
                severity: detail.severity || '',
                expression: detail.expression || '',
                status: detail.status || '',
                message: detail.message || null,
                referencedCells,
            };
            validationResults.push(result);
        }
        const failures = validationResults.filter((v) => v.status === 'Fail').length;
        const warnings = validationResults.filter((v) => v.severity === 'Warning').length;
        logger.info(`Parsed ${validationResults.length} validation results for ${instance.instanceId}`);
        logger.info(`Failures: ${failures}, Warnings: ${warnings}`);
        return validationResults;
    }
}
//# sourceMappingURL=api-client.js.map