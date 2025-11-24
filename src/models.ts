/**
 * Data models for variance analysis application
 */

export interface FormInstance {
  instanceId: string;
  refDate: string;
}

export interface CellMetadata {
  id: string;
  physicalName: string;
  viewCode: string;
}

export interface CellBusinessRule {
  id: number;
  content: string;
  seqNumber: string;
}

export interface CellRecordHeader {
  columnName: string;
  columnLabel: string;
  description: string | null;
  visible: boolean;
  columnType: string;
  valueType: string;
  highlighted: boolean;
}

export interface ValidationCells {
  cell: string;
  value: string;
  instanceId: string;
  pageName: string;
  form: string;
  referenceDate: string;
}

export interface ValidationResult {
  severity: string;
  expression: string;
  status: string;
  message: string | null;
  referencedCells: ValidationCells[];
}

export interface VarianceRecord {
  cellReference: string;
  cellDescription: string;
  instance1Value: any;
  instance2Value: any;
  difference: any;
  percentDifference: any;
}

export interface ReturnConfig {
  code: string;
  name: string;
  expectedDate?: string;
  confirmed?: boolean;
}

export interface AnalysisResult {
  formName: string;
  formCode: string;
  confirmed: boolean;
  baseInstance: FormInstance;
  comparisonInstance: FormInstance;
  variances: Record<string, any>[];
  validationsErrors: ValidationResult[];
}

export interface SummaryRecord {
  formName: string;
  formCode: string;
  varianceCount: number;
  validationErrorCount: number;
}

export interface ConfigFile {
  baseDate: string;
  returns: ReturnConfig[];
  excluded?: ReturnConfig[];
}