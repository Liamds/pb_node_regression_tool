import { useState, useEffect, useRef } from 'react';
import * as React from 'react';
import { trpc } from '../lib/trpc';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Checkbox } from './ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Badge } from './ui/badge';
import { 
  BarChart3, 
  TrendingUp, 
  AlertTriangle, 
  XCircle, 
  Play, 
  RefreshCw, 
  Moon, 
  Sun, 
  FileText,
  Download,
  Trash2,
  Eye,
  StopCircle,
  ChevronDown,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useTheme } from './theme-provider';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { report } from 'process';
import { get } from 'http';

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00'];

function formatCellDescription(description: string): React.ReactNode {
  if (!description) return <span className="text-muted-foreground">-</span>

  const parts = description.split('_');
  if (parts.length ===1) return <span>{description}</span>;

  return (
    <div className="text-left font-mono text-xs">
      {parts.map((part, idx, arr) => {
        const indent = idx * 16;
        const isLast = idx === arr.length -1;
        const isFirst = idx === 0;
        const connector = isFirst ? '' : (isLast ? '└─ ' : '├─ ');

        return (
          <div
            key={idx}
            style={{ paddingLeft: `${indent}px` }}
            className = "leading-relaxed"
          >
            {!isFirst && (
              <span className="text-muted-foreground select-none">{connector}</span>
            )}
            <span className={isFirst ? 'font-semibold' : ''}>{part}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { theme, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [baseDateFilter, setBaseDateFilter] = useState<string>('all');
  const [formFilter, setFormFilter] = useState<string>('all');
  const [varianceThreshold, setVarianceThreshold] = useState(0);
  const [percentThreshold, setPercentThreshold] = useState(0);
  const [runAnalysisOpen, setRunAnalysisOpen] = useState(false);
  const [configFile, setConfigFile] = useState('config.json');
  const [outputFile, setOutputFile] = useState('');
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [currentRunningJob, setCurrentRunningJob] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  const [editingAnnotations, setEditingAnnotations] = useState<Record<string, {
    flagged: boolean;
    category: string | null;
    comment: string | null;
  }>>({});

  // tRPC queries
  const { data: statistics, isLoading: statsLoading, error: statsError, refetch: refetchStats } = trpc.statistics.get.useQuery({});
  const { data: filterOptions, isLoading: filtersLoading, error: filtersError } = trpc.filters.getOptions.useQuery();
  const { data: reports, isLoading: reportsLoading, error: reportsError, refetch: refetchReports } = trpc.reports.list.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    baseDate: baseDateFilter === 'all' ? undefined : baseDateFilter,
    formCode: formFilter === 'all' ? undefined : formFilter,
  });

  const { data: reportDetails, isLoading: detailsLoading, refetch: refetchReportDetails } = trpc.reports.getDetails.useQuery(
    { id: selectedReport || '' },
    { enabled: !!selectedReport }
  );

  const commentTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

  const handleAnnotationEdit = (
    formCode: string,
    cellReference: string,
    field: 'flagged' | 'category' | 'comment',
    value: boolean | string | null
  ) => {
    const key = `${formCode}-${cellReference}`;
    const currentVariance = reportDetails
      ?.flatMap((form: any) => form.topVariances || [])
      .find((v: any) => v['Cell Reference'] === cellReference);

    if (!currentVariance) return;

    const currentEdit = editingAnnotations[key] || {
      flagged: currentVariance.flagged || false,
      category: currentVariance.category || null,
      comment: currentVariance.comment || null,
    };

    setEditingAnnotations({
      ...editingAnnotations,
      [key]: {
        ...currentEdit,
        [field]: value,
      },
    });
  };

  const handleSaveAnnotation = ( formCode: string,  cellReference: string,) => {
    if (!selectedReport) return;

    const key = `${formCode}-${cellReference}`;
    const editState = editingAnnotations[key];

    if (!editState) return;

    const updateData = {
      reportId: selectedReport,
      formCode,
      cellReference,
      flagged: editState.flagged,
      category: editState.category,
      comment: editState.comment,
    };
      
    updateAnnotationMutation.mutate( updateData, {
      onSuccess: () => {
        const newEditing = { ...editingAnnotations };
        delete newEditing[key];
        setEditingAnnotations(newEditing);
        refetchReportDetails();
      },
    });
  };

  const getAnnotationValue = (
    variance: any,
    formCode: string,
    cellReference: string,
    field: 'flagged' | 'category' | 'comment'
  ) : boolean | string | null => {
    const key = `${formCode}-${cellReference}`;
    const editState = editingAnnotations[key];
    
    if (editState) {
      return editState[field];
    }

    if (field === 'flagged') {
      return variance.flagged || false;
    }
    return variance[field] || null;
  };

  const hasUnsavedChanges = (formCode: string, cellReference: string) : boolean => {
    const key = `${formCode}-${cellReference}`;
    return key in editingAnnotations;
  };

  const categories = [
    { value: 'expected', label: 'Expected' },
    { value: 'unexpected', label: 'Unexpected' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'investigating', label: 'Investigating' },
    { value: 'accepted', label: 'Accepted' },
  ];

  // Mutations
  const runAnalysisMutation = trpc.analysis.run.useMutation({
    onSuccess: (data) => {
      setCurrentRunningJob(data.reportId);
      setRunAnalysisOpen(false);
      refetchReports();
    },
  });

  const stopAnalysisMutation = trpc.analysis.stop.useMutation({
    onSuccess: () => {
      setCurrentRunningJob(null);
      refetchReports();
    },
  });

  const deleteReportMutation = trpc.reports.delete.useMutation({
    onSuccess: () => {
      refetchReports();
      refetchStats();
    },
  });

  const updateAnnotationMutation = trpc.variances.updateAnnotation.useMutation({
    onSuccess: () => {
      if (selectedReport){
        // The query will automatically refrehs when we invalidate it
      }
    },
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const backendHost = window.location.hostname === 'localhost'
      ? 'localhost:3000'
      : window.location.host.replace(':5173', ':3000');
    const wsUrl = `${protocol}//${backendHost}`;
    
    let websocket: WebSocket | null = null;

    try {
      websocket = new WebSocket(wsUrl);
    } catch (error) {
      console.error('Websocket connection failed (this is non-critical)', error);
      return;
    }

    if (websocket) {
      websocket.onopen = () => {
        console.log('WebSocket connected');
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'complete' || data.type === 'error') {
            setCurrentRunningJob(null);
            refetchReports();
            refetchStats();
          }
        } catch (error) {
          console.error('Error parsing Websocket message:', error);
        }
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      websocket.onclose = () => {
        console.log('WebSocket disconnected');
      };

      setWs(websocket);

      return () => {
        if (websocket) {
          websocket.close();
        }
      };
    }
  }, []);

  const handleRunAnalysis = () => {
    runAnalysisMutation.mutate({
      configFile,
      outputFile: outputFile || undefined,
    });
  };

  const handleStopAnalysis = () => {
    if (currentRunningJob) {
      stopAnalysisMutation.mutate({ reportId: currentRunningJob });
    }
  };

  const handleDeleteReport = (reportId: string) => {
    if (confirm('Are you sure you want to delete this report?')) {
      deleteReportMutation.mutate({ id: reportId });
    }
  };

  const handleDownloadReport = (reportId: string) => {
    window.open(`/api/reports/${reportId}/download`, '_blank');
  };

  const filteredReports = reports?.filter(report => {
    const matchesSearch = !searchQuery || 
      report.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.baseDate.includes(searchQuery);
    
    const matchesVarianceThreshold = report.totalVariances >= varianceThreshold;
    const matchesPercentThreshold = report.totalVariances > 0 && 
      (report.totalVariances / report.totalReturns) * 100 >= percentThreshold;

    return matchesSearch && matchesVarianceThreshold && matchesPercentThreshold;
  }) || [];

  // Prepare chart data
  const varianceTrendData = reports?.slice(0, 10).map(report => ({
    date: new Date(report.timestamp).toLocaleDateString(),
    variances: report.totalVariances,
  })) || [];

  const errorTrendData = reports?.slice(0, 10).map(report => ({
    date: new Date(report.timestamp).toLocaleDateString(),
    errors: report.totalValidationErrors,
  })) || [];

  if (statsLoading && filtersLoading && reportsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-content">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-forground">Loading dashboard...</p>
        </div>
      </div>
      
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Variance Analysis Dashboard
          </h1>
          <div className="flex items-center gap-2">
            <Dialog open={runAnalysisOpen} onOpenChange={setRunAnalysisOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Play className="h-4 w-4 mr-2" />
                  Run Analysis
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Run Analysis</DialogTitle>
                  <DialogDescription>
                    Start a new variance analysis job
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="configFile">Configuration File</Label>
                    <Input
                      id="configFile"
                      value={configFile}
                      onChange={(e) => setConfigFile(e.target.value)}
                      placeholder="e.g., config.json"
                    />
                  </div>
                  <div>
                    <Label htmlFor="outputFile">Output File (optional)</Label>
                    <Input
                      id="outputFile"
                      value={outputFile}
                      onChange={(e) => setOutputFile(e.target.value)}
                      placeholder="e.g., report.xlsx"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRunAnalysisOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleRunAnalysis} disabled={runAnalysisMutation.isPending}>
                    {runAnalysisMutation.isPending ? 'Starting...' : 'Start Analysis'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" onClick={() => { refetchReports(); refetchStats(); }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Error Messages */}
        {(statsError || filtersError || reportsError) && (
          <Card className="border-red-500">
            <CardHeader>
              <CardTitle className="text-red-600">Error Loading Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {statsError && <p>Statistics: {statsError.message}</p>}
                {filtersError && <p>Filters: {filtersError.message}</p>}
                {reportsError && <p>Reports: {reportsError.message}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading Indicator */}
        {(statsLoading || filtersLoading || reportsLoading) && (
          <Card>
            <CardContent className="py-8 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-muted-forground">Loading dashboard data...</p>
            </CardContent>
          </Card>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics?.totalReports || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Variances</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics?.totalVariances || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Validation Errors</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics?.totalValidationErrors || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Variances Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={varianceTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="variances" stroke="#8884d8" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Validation Errors Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={errorTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="errors" stroke="#ff7300" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Completed', value: statistics?.completedReports || 0 },
                      { name: 'Running', value: statistics?.runningReports || 0 },
                      { name: 'Failed', value: statistics?.failedReports || 0 },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {[0, 1, 2].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Running Analysis */}
        {currentRunningJob && (
          <Card className="border-orange-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Analysis in Progress</CardTitle>
                <Button variant="destructive" size="sm" onClick={handleStopAnalysis}>
                  <StopCircle className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-muted-forground">Running analysis...</p>
              <p className="text-sm text-muted-foreground">
                Report ID: {currentRunningJob}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Reports Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
            <CardDescription>View and manage your analysis reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Search reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 min-w-[200px]"
                />
                <Input
                  type="number"
                  placeholder="Min variance"
                  value={varianceThreshold}
                  onChange={(e) => setVarianceThreshold(Number(e.target.value))}
                  className="w-[150px]"
                />
                <Input
                  type="number"
                  placeholder="Min %"
                  value={percentThreshold}
                  onChange={(e) => setPercentThreshold(Number(e.target.value))}
                  className="w-[100px]"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={baseDateFilter} onValueChange={setBaseDateFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Base Dates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Base Dates</SelectItem>
                    {filterOptions?.baseDates
                      ?.filter((date: string) => date && date.trim() !== '')
                      .map((date: string) => (
                      <SelectItem key={date} value={date}>{date}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={formFilter} onValueChange={setFormFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Forms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Forms</SelectItem>
                    {filterOptions?.formCodes
                      ?.filter((form: { code: string; name: string }) => form.code && form.code.trim() !== '')
                      .map((form: { code: string; name: string }) => (
                      <SelectItem key={form.code} value={form.code}>{form.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Base Date</TableHead>
                      <TableHead>Returns</TableHead>
                      <TableHead>Variances</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No reports found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredReports.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell>{new Date(report.timestamp).toLocaleString()}</TableCell>
                          <TableCell>{report.baseDate}</TableCell>
                          <TableCell>{report.totalReturns}</TableCell>
                          <TableCell>{report.totalVariances}</TableCell>
                          <TableCell>{report.totalValidationErrors}</TableCell>
                          <TableCell>{report.duration}s</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-xs ${
                              report.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                              report.status === 'running' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                              'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}>
                              {report.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSelectedReport(report.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDownloadReport(report.id)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteReport(report.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Report Detail Dialog */ }
        <Dialog open={!!selectedReport} onOpenChange={(open) => {
          if (!open) {
            setSelectedReport(null);
            setEditingAnnotations({});
          }
        }}>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Report Details</DialogTitle>
              <DialogDescription>
                View details variance information for this report
              </DialogDescription>
            </DialogHeader>
            {detailsLoading ? (
              <div className="py-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p className="text-muted-forground">Loading report details...</p>
              </div>
            ) : reportDetails && reportDetails.length > 0 ? (
              <Accordion type="multiple" className="w-full">
                {reportDetails.map((form: any, formIndex: number) => {
                  // Determine form status
                  const hasVariances = (form.varianceCount || 0) > 0;
                  const hasValidationErrors = (form.validationErrorCount || 0) > 0;
                  const hasIssues = hasVariances || hasValidationErrors;
                  const isConfirmed = form.confirmed === true;
                  
                  let status: 'success' | 'error' | 'warning' = 'success';
                  let statusIcon: React.ReactNode = <CheckCircle2 className="h-4 w-4" />;
                  let statusText = 'Good';
                  
                  if (hasIssues && isConfirmed) {
                    status = 'error';
                    statusIcon = <XCircle className="h-4 w-4" />;
                    statusText = 'Confirmed with Issues';
                  } else if (hasIssues && !isConfirmed) {
                    status = 'warning';
                    statusIcon = <AlertCircle className="h-4 w-4" />;
                    statusText = 'Unconfirmed Issues';
                  } else {
                    status = 'success';
                    statusIcon = <CheckCircle2 className="h-4 w-4" />;
                    statusText = 'Good';
                  }
                  
                  return (
                    <AccordionItem 
                      key={formIndex} 
                      value={`form-${formIndex}`} 
                      className={`border rounded-lg mb-4 ${
                        status === 'error' ? 'border-red-500/50 bg-red-50/50 dark:bg-red-950/20' :
                        status === 'warning' ? 'border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20' :
                        'border-green-500/50 bg-green-50/50 dark:bg-green-950/20'
                      }`}
                    >
                      <AccordionTrigger className="px-6 hover:no-underline">
                        <div className="flex flex-col items-start text-left w-full">
                          <div className="flex items-center gap-3 w-full">
                            <div className="flex-1">
                              <CardTitle className="text-lg flex items-center gap-2">
                                {form.formCode} - {form.formName || 'N/A'}
                                <Badge variant={status} className="ml-2 flex items-center gap-1">
                                  {statusIcon}
                                  {statusText}
                                </Badge>
                                {isConfirmed && (
                                  <Badge variant="secondary" className="flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Confirmed
                                  </Badge>
                                )}
                              </CardTitle>
                              <CardDescription className="mt-1">
                                Base Date: {form.baseDate} | Comparison Date: {form.comparisonDate}
                                {hasVariances && (
                                  <span className="ml-2 text-muted-foreground">
                                    ({form.varianceCount || 0} variance{(form.varianceCount || 0) !== 1 ? 's' : ''})
                                  </span>
                                )}
                                {hasValidationErrors && (
                                  <span className="ml-2 text-destructive">
                                    ({form.validationErrorCount || 0} validation error{(form.validationErrorCount || 0) !== 1 ? 's' : ''})
                                  </span>
                                )}
                              </CardDescription>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-6">
                      {form.topVariances && form.topVariances.length > 0? (
                        <div className="border rounded-lg overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Cell Reference</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>{form.baseDate}</TableHead>
                                <TableHead>{form.comparisonDate}</TableHead>
                                <TableHead>Difference</TableHead>
                                <TableHead>% Difference</TableHead>
                                <TableHead>Flagged</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Comment</TableHead>
                                <TableHead className="w-20">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {form.topVariances.map((variance: any, idx: number) => {
                                const cellRef = variance['Cell Reference'];
                                const hasChanges = hasUnsavedChanges(form.formCode, cellRef);
                                const isSaving = updateAnnotationMutation.isPending;

                                return (
                                  <TableRow key={idx}>
                                    <TableCell>
                                      <Checkbox
                                        checked={getAnnotationValue(variance, form.formCode, cellRef, 'flagged') as boolean}
                                        onCheckedChange={(checked) => {
                                          handleAnnotationEdit(
                                            form.formCode,
                                            cellRef,
                                            'flagged',
                                            checked === true
                                          );
                                        }}
                                        disabled={updateAnnotationMutation.isPending}
                                      />
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{cellRef}</TableCell>
                                    <TableCell className="max-w-xs">
                                      {formatCellDescription(variance['Cell Description'])}
                                    </TableCell>
                                    <TableCell>{variance[form.baseDate]}</TableCell>
                                    <TableCell>{variance[form.comparisonDate]}</TableCell>
                                    <TableCell>{variance['Difference']}</TableCell>
                                    <TableCell>{variance['% Difference']}</TableCell>
                                    <TableCell>
                                      <Select
                                        value = {getAnnotationValue(variance, form.formCode, cellRef, 'category') as string || 'none'}
                                        onValueChange={(value) => {
                                          handleAnnotationEdit(
                                            form.formCode,
                                            variance['Cell Reference'],
                                            'category',
                                            value === 'none' ? null : value
                                          );
                                        }}
                                        disabled={isSaving}
                                      >
                                        <SelectTrigger className="w[150px] h-8">
                                          <SelectValue placeholder="Select Category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">-</SelectItem>
                                          {categories.map((cat) => (
                                            <SelectItem key={cat.value} value={cat.value}>
                                              {cat.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell>
                                      <textarea
                                        value={getAnnotationValue(variance, form.formCode, cellRef, 'comment') as string || ''}
                                      onChange={(e) => {
                                        handleAnnotationEdit(
                                          form.formCode,
                                          cellRef,
                                          'comment',
                                          e.target.value || null
                                        );
                                        }}
                                        placeholder="Enter comment..."
                                        className="flex min-h-[60px] w-full min-w-[200px] rounded-md border border-unput bg-background px-3 py-2 text-sm ring-offeset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={updateAnnotationMutation.isPending}
                                        rows={2}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        size="sm"
                                        onClick={() => handleSaveAnnotation(form.formCode, cellRef)}
                                        disabled={!hasChanges || isSaving}
                                        variant={hasChanges ? "default" : "outline"}
                                        className="w-full"
                                        title={hasChanges ? "Save Changes" : "No changes to save"}
                                      >
                                        {isSaving ? (
                                          <>
                                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                            Saving...
                                          </>
                                        ) : (
                                          'Save'
                                        )}
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-center py-4">No variances found for this form</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              <p className="text-muted-foregroud text-center py-8">No report details available</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedReport(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

