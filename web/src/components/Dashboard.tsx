import { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
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
  StopCircle
} from 'lucide-react';
import { useTheme } from './theme-provider';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00'];

export default function Dashboard() {
  const { theme, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [baseDateFilter, setBaseDateFilter] = useState<string>('');
  const [formFilter, setFormFilter] = useState<string>('');
  const [varianceThreshold, setVarianceThreshold] = useState(0);
  const [percentThreshold, setPercentThreshold] = useState(0);
  const [runAnalysisOpen, setRunAnalysisOpen] = useState(false);
  const [configFile, setConfigFile] = useState('config.json');
  const [outputFile, setOutputFile] = useState('');
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [currentRunningJob, setCurrentRunningJob] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // tRPC queries
  const { data: statistics, refetch: refetchStats } = trpc.statistics.get.useQuery({});
  const { data: filterOptions } = trpc.filters.getOptions.useQuery();
  const { data: reports, refetch: refetchReports } = trpc.reports.list.useQuery({
    status: statusFilter || undefined,
    baseDate: baseDateFilter || undefined,
    formCode: formFilter || undefined,
  });

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

  // WebSocket connection for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected');
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'complete' || data.type === 'error') {
        setCurrentRunningJob(null);
        refetchReports();
        refetchStats();
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
      websocket.close();
    };
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
                    <SelectItem value="">All Status</SelectItem>
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
                    <SelectItem value="">All Base Dates</SelectItem>
                    {filterOptions?.baseDates.map(date => (
                      <SelectItem key={date} value={date}>{date}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={formFilter} onValueChange={setFormFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Forms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Forms</SelectItem>
                    {filterOptions?.formCodes.map(form => (
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
      </div>
    </div>
  );
}

