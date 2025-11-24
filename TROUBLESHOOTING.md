# Troubleshooting Guide

Common issues and solutions for the AgileReporter Variance Analysis Tool.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Authentication Problems](#authentication-problems)
- [API Connection Issues](#api-connection-issues)
- [Database Problems](#database-problems)
- [Dashboard Issues](#dashboard-issues)
- [Excel Export Problems](#excel-export-problems)
- [Performance Issues](#performance-issues)
- [Error Messages](#error-messages)

## Installation Issues

### npm install fails

**Symptom**: Errors during `npm install`

**Possible Causes**:
- Outdated Node.js version
- Network connectivity issues
- Permissions problems

**Solutions**:

1. **Check Node.js version**:
   ```bash
   node --version  # Should be >= 18.0.0
   ```

2. **Update npm**:
   ```bash
   npm install -g npm@latest
   ```

3. **Clear npm cache**:
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

4. **Try alternative registry**:
   ```bash
   npm install --registry=https://registry.npmjs.org
   ```

5. **Fix permissions (Linux/Mac)**:
   ```bash
   sudo chown -R $USER:$GROUP ~/.npm
   sudo chown -R $USER:$GROUP .
   ```

---

### Build fails with TypeScript errors

**Symptom**: `npm run build` fails with type errors

**Solutions**:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Check TypeScript version**:
   ```bash
   npx tsc --version
   ```

3. **Clean and rebuild**:
   ```bash
   npm run clean
   npm run build
   ```

4. **Check tsconfig.json**:
   Ensure it matches the provided configuration

---

## Authentication Problems

### Authentication failed

**Symptom**: "Authentication failed" error when running analysis

**Possible Causes**:
- Invalid credentials in `.env`
- Expired credentials
- Network issues
- API endpoint changes

**Solutions**:

1. **Verify .env file exists**:
   ```bash
   ls -la .env
   ```

2. **Check credentials format**:
   ```bash
   # .env should contain:
   AUTH_URL=https://domain.agilereporter.com/agilereporter/oauth/token
   API_BASE_URL=https://domain.agilereporter.com/agilereporter/rest/api
   APRA_USERNAME=your_username
   PASSWORD=your_password
   GRANT_TYPE=password
   CLIENT_ID=your_client_id
   CLIENT_SECRET=your_client_secret
   ```

3. **Remove quotes and whitespace**:
   ```bash
   # Bad
   APRA_USERNAME=" username "
   
   # Good
   APRA_USERNAME=username
   ```

4. **Test authentication manually**:
   ```bash
   npm run debug-auth
   ```

5. **Check API connectivity**:
   ```bash
   curl https://your-domain.agilereporter.com/agilereporter/oauth/token
   ```

6. **Verify credentials in browser**:
   - Log into AgileReporter web interface
   - Confirm your account is active

---

### Token expired during analysis

**Symptom**: Analysis fails partway through with authentication error

**Cause**: OAuth token expired during long-running analysis

**Solutions**:

1. **Increase token lifetime** (if possible with API provider)

2. **Implement token refresh** (requires code modification):
   ```typescript
   // In api-client.ts
   private async ensureAuthenticated(): Promise<void> {
     if (!this.token || this.isTokenExpired()) {
       await this.authenticate();
     }
   }
   ```

3. **Retry failed requests**:
   - Already implemented with `maxRetries` parameter
   - Check retry logic is working

---

## API Connection Issues

### Connection timeout

**Symptom**: "Request failed with status XXX" or timeout errors

**Possible Causes**:
- Network connectivity
- Firewall blocking requests
- API server down
- Request taking too long

**Solutions**:

1. **Check network connectivity**:
   ```bash
   ping your-domain.agilereporter.com
   ```

2. **Test API endpoint**:
   ```bash
   curl -I https://your-domain.agilereporter.com
   ```

3. **Increase timeout** (in `api-client.ts`):
   ```typescript
   this.axiosInstance = axios.create({
     timeout: 3600000, // Increase to 60 minutes
   });
   ```

4. **Check firewall settings**:
   - Ensure HTTPS (port 443) is allowed
   - Whitelist AgileReporter domain

5. **Use VPN if required**:
   - Some organizations require VPN for API access

---

### SSL/TLS certificate errors

**Symptom**: "certificate verify failed" or SSL errors

**Solutions**:

1. **Update Node.js**:
   ```bash
   node --version  # Should be latest LTS
   ```

2. **Disable SSL verification (NOT recommended for production)**:
   ```typescript
   // In api-client.ts
   this.axiosInstance = axios.create({
     httpsAgent: new https.Agent({
       rejectUnauthorized: false, // Only for testing!
     }),
   });
   ```

3. **Install certificates**:
   ```bash
   # Linux
   sudo apt-get install ca-certificates
   
   # Mac
   brew install openssl
   ```

---

### Rate limiting

**Symptom**: "429 Too Many Requests" error

**Solutions**:

1. **Reduce concurrency** (in `variance-analyzer.ts`):
   ```typescript
   const limit = pLimit(2); // Reduce from 3 to 2
   ```

2. **Add delays between requests**:
   ```typescript
   await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
   ```

3. **Contact API provider**:
   - Request higher rate limits
   - Understand rate limit policies

---

## Database Problems

### Database locked

**Symptom**: "database is locked" or "SQLITE_BUSY" error

**Cause**: Multiple processes accessing database simultaneously

**Solutions**:

1. **Stop all processes**:
   ```bash
   # Linux/Mac
   pkill -f "node.*dashboard"
   pkill -f "node.*main"
   
   # Windows
   taskkill /F /IM node.exe
   ```

2. **Remove lock file**:
   ```bash
   rm reports/reports.db-journal
   rm reports/reports.db-wal
   ```

3. **Check for orphaned connections**:
   ```bash
   lsof | grep reports.db
   ```

4. **Restart dashboard**:
   ```bash
   npm run dashboard
   ```

5. **If persists, recreate database**:
   ```bash
   # BACKUP FIRST!
   cp reports/reports.db reports/reports.db.backup
   rm reports/reports.db
   npm run dashboard  # Will create new database
   ```

---

### Database corruption

**Symptom**: "database disk image is malformed" error

**Solutions**:

1. **Backup current database**:
   ```bash
   cp reports/reports.db reports/reports.db.corrupted
   ```

2. **Try to repair**:
   ```bash
   sqlite3 reports/reports.db "PRAGMA integrity_check;"
   ```

3. **Export and reimport**:
   ```bash
   sqlite3 reports/reports.db .dump > backup.sql
   rm reports/reports.db
   sqlite3 reports/reports.db < backup.sql
   ```

4. **Start fresh** (loses history):
   ```bash
   rm reports/reports.db
   npm run dashboard
   ```

---

### Out of disk space

**Symptom**: "SQLITE_FULL" or "no space left on device"

**Solutions**:

1. **Check disk space**:
   ```bash
   df -h
   ```

2. **Clean up old reports**:
   ```bash
   # Delete old Excel files
   find reports -name "*.xlsx" -mtime +30 -delete
   
   # Or use the cleanup function
   # In report-saver.ts:
   await reportSaver.cleanupOldReports(10); // Keep last 10
   ```

3. **Vacuum database**:
   ```bash
   sqlite3 reports/reports.db "VACUUM;"
   ```

4. **Move reports directory**:
   ```bash
   mv reports /path/to/larger/disk/reports
   ln -s /path/to/larger/disk/reports reports
   ```

---

## Dashboard Issues

### Dashboard won't start

**Symptom**: "EADDRINUSE" error or dashboard doesn't start

**Solutions**:

1. **Check port availability**:
   ```bash
   # Linux/Mac
   lsof -i :3000
   
   # Windows
   netstat -ano | findstr :3000
   ```

2. **Kill process using port**:
   ```bash
   # Linux/Mac
   kill -9 <PID>
   
   # Windows
   taskkill /PID <PID> /F
   ```

3. **Use different port**:
   ```bash
   npm run dashboard -- --port 8080
   ```

4. **Check for other errors**:
   ```bash
   npm run dashboard -- --verbose
   ```

---

### Dashboard shows no data

**Symptom**: Dashboard loads but shows empty reports

**Possible Causes**:
- No reports in database
- Database read error
- API request failed

**Solutions**:

1. **Check database exists**:
   ```bash
   ls -la reports/reports.db
   ```

2. **Check database content**:
   ```bash
   sqlite3 reports/reports.db "SELECT COUNT(*) FROM reports;"
   ```

3. **Run analysis to create reports**:
   ```bash
   npm run start config.json
   ```

4. **Check browser console**:
   - Open Developer Tools (F12)
   - Look for JavaScript errors
   - Check Network tab for failed requests

5. **Check server logs**:
   ```bash
   tail -f logs/app-$(date +%Y-%m-%d).log
   ```

6. **Refresh page with cache clear**:
   - Chrome/Edge: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Firefox: Ctrl+F5

---

### WebSocket not connecting

**Symptom**: Real-time updates not working, WebSocket errors in console

**Solutions**:

1. **Check WebSocket support**:
   - Open browser console
   - Check for WebSocket errors

2. **Verify server is running**:
   ```bash
   curl http://localhost:3000/api/health
   ```

3. **Check firewall**:
   - Ensure WebSocket connections allowed
   - Some corporate firewalls block WebSocket

4. **Try different browser**:
   - Test in Chrome, Firefox, Edge

5. **Check for proxy issues**:
   - WebSocket may not work through some proxies
   - Configure proxy to allow WebSocket upgrade

---

### Charts not displaying

**Symptom**: Chart sections are empty or show errors

**Solutions**:

1. **Check Chart.js loaded**:
   - Open browser console
   - Type: `typeof Chart` should return "function"

2. **Verify data exists**:
   - Open Developer Tools → Network tab
   - Check `/api/reports` response has data

3. **Check for JavaScript errors**:
   - Open browser console
   - Look for errors in chart creation

4. **Clear browser cache**:
   ```
   Ctrl+Shift+Delete (Windows/Linux)
   Cmd+Shift+Delete (Mac)
   ```

5. **Reload Chart.js**:
   - Check `dashboard/public/index.html`
   - Verify CDN link is accessible

---

## Excel Export Problems

### Excel file not created

**Symptom**: Analysis completes but no Excel file

**Possible Causes**:
- File write permissions
- Invalid path
- Disk space
- Excel generation error

**Solutions**:

1. **Check write permissions**:
   ```bash
   ls -la reports/
   chmod 755 reports/
   ```

2. **Verify disk space**:
   ```bash
   df -h .
   ```

3. **Check for errors in logs**:
   ```bash
   grep -i error logs/app-*.log
   ```

4. **Try different output path**:
   ```bash
   npm run start config.json --output ~/Desktop/report.xlsx
   ```

5. **Test Excel library**:
   ```bash
   # Create test file
   node -e "const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); wb.xlsx.writeFile('test.xlsx').then(() => console.log('OK'));"
   ```

---

### Excel file corrupted

**Symptom**: "Excel cannot open the file" error

**Possible Causes**:
- Analysis interrupted
- Disk full during write
- Excel library bug

**Solutions**:

1. **Re-run analysis**:
   ```bash
   npm run start config.json
   ```

2. **Check disk space during export**:
   ```bash
   df -h .
   ```

3. **Try opening with different program**:
   - LibreOffice Calc
   - Google Sheets
   - Excel Online

4. **Check file size**:
   ```bash
   ls -lh reports/*.xlsx
   ```
   If 0 bytes, file write failed

---

### Excel formatting issues

**Symptom**: Colors, tables, or filters not working

**Solutions**:

1. **Update ExcelJS**:
   ```bash
   npm update exceljs
   ```

2. **Check Excel version**:
   - Older Excel versions have limited support
   - Try Excel 2016 or later

3. **Open and repair**:
   - Excel → Open → Browse
   - Select file
   - Click arrow next to "Open"
   - Select "Open and Repair"

---

## Performance Issues

### Analysis very slow

**Symptom**: Analysis takes much longer than expected

**Possible Causes**:
- Large number of returns
- Slow network
- API throttling
- Insufficient resources

**Solutions**:

1. **Check network latency**:
   ```bash
   ping your-domain.agilereporter.com
   ```

2. **Increase concurrency** (in `variance-analyzer.ts`):
   ```typescript
   const limit = pLimit(5); // Increase from 3
   ```

3. **Reduce log verbosity**:
   ```bash
   npm run start config.json  # Without --verbose
   ```

4. **Check system resources**:
   ```bash
   # CPU and memory usage
   top
   ```

5. **Process fewer returns**:
   - Split config.json into smaller batches
   - Run multiple analyses

6. **Optimize database**:
   ```bash
   sqlite3 reports/reports.db "VACUUM; ANALYZE;"
   ```

---

### Dashboard slow/unresponsive

**Symptom**: Dashboard loads slowly or becomes unresponsive

**Solutions**:

1. **Limit displayed data**:
   - Use filters to reduce data
   - Pagination not yet implemented (consider adding)

2. **Close unused browser tabs**:
   - Frees memory

3. **Clear browser cache**:
   - Improves loading speed

4. **Check server resources**:
   ```bash
   top
   # Look for high CPU or memory usage
   ```

5. **Restart dashboard**:
   ```bash
   pkill -f "node.*dashboard"
   npm run dashboard
   ```

6. **Reduce chart data** (in `app.js`):
   ```javascript
   // Limit to last 30 days
   const recentReports = allReports.filter(r => {
     const age = Date.now() - new Date(r.timestamp).getTime();
     return age < 30 * 24 * 60 * 60 * 1000;
   });
   ```

---

### High memory usage

**Symptom**: Node.js process using excessive memory

**Solutions**:

1. **Increase Node.js memory**:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm run start config.json
   ```

2. **Process in batches**:
   ```bash
   # Split into multiple config files
   npm run start config1.json
   npm run start config2.json
   ```

3. **Clear caches**:
   ```typescript
   // In variance-analyzer.ts
   // Add periodic cleanup
   ```

4. **Monitor memory**:
   ```bash
   node --trace-gc dist/main.js config.json
   ```

---

## Error Messages

### "ECONNRESET" / "socket hang up"

**Cause**: Network connection interrupted

**Solutions**:
- Check network stability
- Increase timeout values
- Retry logic already implemented
- Try from different network

---

### "Invalid JSON in configuration file"

**Cause**: Malformed JSON in config.json

**Solutions**:

1. **Validate JSON**:
   ```bash
   node -e "console.log(JSON.parse(require('fs').readFileSync('config.json')))"
   ```

2. **Use JSON validator**:
   - https://jsonlint.com
   - Paste config.json content

3. **Check for common issues**:
   - Missing commas
   - Trailing commas
   - Unquoted keys
   - Single quotes instead of double quotes

---

### "No instances found for XXX"

**Cause**: Form code doesn't exist or no data available

**Solutions**:

1. **Verify form code**:
   - Check spelling
   - Confirm code exists in AgileReporter

2. **Check date range**:
   - Ensure data exists for baseDate

3. **Test API directly**:
   ```bash
   curl -H "Authorization: Bearer TOKEN" \
     "https://domain.agilereporter.com/agilereporter/rest/api/returns?formCode=ARF1100"
   ```

---

### "File not found: config.json"

**Cause**: Configuration file doesn't exist or wrong path

**Solutions**:

1. **Check file exists**:
   ```bash
   ls -la config.json
   ```

2. **Use absolute path**:
   ```bash
   npm run start /full/path/to/config.json
   ```

3. **Check current directory**:
   ```bash
   pwd
   ```

---

### "Cannot find module 'XXX'"

**Cause**: Missing npm package

**Solutions**:

1. **Reinstall dependencies**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check package.json**:
   - Ensure all dependencies listed

3. **Rebuild**:
   ```bash
   npm run build
   ```

---

## Getting Additional Help

### Collecting Diagnostic Information

When reporting issues, include:

1. **Version information**:
   ```bash
   node --version
   npm --version
   cat package.json | grep version
   ```

2. **Error logs**:
   ```bash
   tail -100 logs/app-*.log > debug.log
   tail -100 logs/errors-*.log >> debug.log
   ```

3. **Configuration** (sanitized):
   - Remove credentials
   - Include config.json structure

4. **System information**:
   ```bash
   # Linux/Mac
   uname -a
   
   # Windows
   systeminfo
   ```

### Support Channels

1. Create detailed GitHub issue
2. Check existing issues
3. Consult API documentation
4. Contact AgileReporter support

### Escalation Path

1. Check this troubleshooting guide
2. Search logs for specific errors
3. Test in isolation (minimal config)
4. Create reproducible example
5. Report with full diagnostic information

---

## Prevention Tips

### Regular Maintenance

```bash
# Weekly
npm run dashboard
# Delete old reports via UI

# Monthly
npm update
npm audit fix
sqlite3 reports/reports.db "VACUUM;"

# Quarterly
Review and archive old reports
Update dependencies
Check for security updates
```

### Monitoring

Set up monitoring for:
- Disk space
- Memory usage
- API response times
- Error rates in logs

### Backups

```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf backups/reports_$DATE.tar.gz reports/
find backups/ -mtime +90 -delete
```

---

**Last Updated**: November 2024  
**For additional help**: See [README.md](./README.md) or [API_REFERENCE.md](./API_REFERENCE.md)