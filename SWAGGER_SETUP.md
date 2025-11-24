# Swagger API Documentation Setup

Automated API documentation using Swagger/OpenAPI 3.0 with JSDoc comments.

## Overview

The variance analysis tool includes **automatic API documentation** that:
- ✅ Generates documentation from JSDoc comments in code
- ✅ Provides interactive API testing interface
- ✅ Automatically updates when endpoints are added/modified
- ✅ Includes request/response examples
- ✅ Supports direct API calls from the browser

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `swagger-jsdoc` - Generates OpenAPI spec from JSDoc
- `swagger-ui-express` - Serves interactive UI

### 2. Start the Dashboard

```bash
npm run dashboard
```

### 3. Access API Documentation

Open in your browser:
- **Swagger UI**: http://localhost:3000/api-docs
- **OpenAPI Spec**: http://localhost:3000/api-docs.json

### 4. Test APIs

From the Swagger UI:
1. Click on any endpoint to expand it
2. Click "Try it out"
3. Fill in parameters
4. Click "Execute"
5. View the response

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  JSDoc Comments in server.ts                        │
│  @swagger tags with OpenAPI YAML                    │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  swagger-jsdoc                                       │
│  Parses JSDoc and generates OpenAPI 3.0 spec        │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  swagger-ui-express                                  │
│  Serves interactive documentation at /api-docs      │
└─────────────────────────────────────────────────────┘
```

## How It Works

### 1. JSDoc Comments with @swagger Tag

Each API endpoint in `src/dashboard/server.ts` has a JSDoc comment:

```typescript
/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: Get all reports
 *     description: Retrieve a list of all analysis reports
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of reports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reports:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Report'
 */
this.app.get('/api/reports', async (req: Request, res: Response) => {
  // Implementation
});
```

### 2. Swagger Configuration

The `src/dashboard/swagger.ts` file configures:
- API metadata (title, version, description)
- Server URLs
- Reusable schemas (Report, FormDetail, etc.)
- Tags for grouping endpoints

### 3. Automatic Generation

When the server starts:
1. `swagger-jsdoc` scans `server.ts` for `@swagger` comments
2. Generates complete OpenAPI 3.0 specification
3. `swagger-ui-express` serves the spec as interactive UI

## Adding New Endpoints

### Step 1: Add JSDoc Comment

When creating a new endpoint, add a `@swagger` JSDoc comment above it:

```typescript
/**
 * @swagger
 * /api/custom-endpoint:
 *   post:
 *     summary: Brief description
 *     description: Detailed description
 *     tags: [TagName]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field1:
 *                 type: string
 *                 description: Field description
 *               field2:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Success response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
this.app.post('/api/custom-endpoint', async (req: Request, res: Response) => {
  // Implementation
});
```

### Step 2: Restart Server

```bash
npm run dashboard
```

The documentation updates **automatically** - no manual editing required!

### Step 3: Verify

Visit http://localhost:3000/api-docs and your new endpoint appears in the list.

## Defining Reusable Schemas

### In swagger.ts

Add schemas to the `components.schemas` section:

```typescript
components: {
  schemas: {
    CustomData: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique identifier'
        },
        value: {
          type: 'number',
          description: 'Numeric value'
        },
        timestamp: {
          type: 'string',
          format: 'date-time'
        }
      }
    }
  }
}
```

### Reference in Endpoints

```typescript
/**
 * @swagger
 * /api/custom:
 *   get:
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomData'
 */
```

## OpenAPI Specification Reference

### Common Data Types

```yaml
# String
type: string
example: "Hello World"

# Integer
type: integer
example: 42

# Number (float)
type: number
example: 3.14

# Boolean
type: boolean
example: true

# Array
type: array
items:
  type: string

# Object
type: object
properties:
  field1:
    type: string

# Date
type: string
format: date
example: "2025-06-30"

# DateTime
type: string
format: date-time
example: "2025-11-24T10:00:00.000Z"

# Enum
type: string
enum: [option1, option2, option3]

# Nullable
type: string
nullable: true
```

### Parameters

```yaml
# Query parameter
parameters:
  - in: query
    name: paramName
    schema:
      type: string
    description: Parameter description
    required: false

# Path parameter
parameters:
  - in: path
    name: id
    required: true
    schema:
      type: string

# Header parameter
parameters:
  - in: header
    name: X-Custom-Header
    schema:
      type: string
```

### Request Body

```yaml
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required: [field1]
        properties:
          field1:
            type: string
          field2:
            type: integer
      example:
        field1: "value"
        field2: 123
```

### Responses

```yaml
responses:
  200:
    description: Success
    content:
      application/json:
        schema:
          type: object
          properties:
            success:
              type: boolean
  400:
    description: Bad Request
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Error'
  404:
    description: Not Found
  500:
    description: Server Error
```

### Tags

Group related endpoints:

```yaml
tags: [Reports]  # Single tag
tags: [Reports, Export]  # Multiple tags
```

Define tags in `swagger.ts`:

```typescript
tags: [
  {
    name: 'Reports',
    description: 'Report management endpoints'
  }
]
```

## Best Practices

### 1. Be Descriptive

```typescript
// ❌ Bad
/**
 * @swagger
 * /api/data:
 *   get:
 *     summary: Get data
 */

// ✅ Good
/**
 * @swagger
 * /api/reports/{id}/details:
 *   get:
 *     summary: Get report details
 *     description: Retrieve detailed form-level data including top 100 variances for each form
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique report identifier
 */
```

### 2. Include Examples

```yaml
schema:
  type: object
  properties:
    name:
      type: string
      example: "Balance Sheet"
    code:
      type: string
      example: "ARF1100"
```

### 3. Use Schema References

```typescript
// Define once in swagger.ts
Report: {
  type: 'object',
  properties: { /* ... */ }
}

// Reuse everywhere
schema:
  $ref: '#/components/schemas/Report'
```

### 4. Document All Response Codes

```yaml
responses:
  200:
    description: Success
  400:
    description: Invalid request
  404:
    description: Resource not found
  500:
    description: Server error
```

### 5. Keep Comments Close to Code

JSDoc should be **immediately above** the endpoint:

```typescript
/**
 * @swagger
 * ...
 */
this.app.get('/api/endpoint', handler);
```

### 6. Test Your Documentation

After adding/modifying endpoints:
1. Restart server
2. Open http://localhost:3000/api-docs
3. Click "Try it out" on your endpoint
4. Verify request/response match documentation

## Customization

### Change API Title

In `src/dashboard/swagger.ts`:

```typescript
info: {
  title: 'Your Custom API Title',
  version: '2.0.0',
  description: 'Your custom description'
}
```

### Add Authentication

```typescript
components: {
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT'
    }
  }
}

// Apply to all endpoints
security: [
  { bearerAuth: [] }
]

// Or per endpoint
/**
 * @swagger
 * /api/secure:
 *   get:
 *     security:
 *       - bearerAuth: []
 */
```

### Customize UI Theme

In `src/dashboard/server.ts`:

```typescript
this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #2563eb }
  `,
  customSiteTitle: 'My Custom API Docs',
  customfavIcon: '/custom-icon.ico'
}));
```

### Multiple API Versions

```typescript
// v1 docs
this.app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecV1));

// v2 docs
this.app.use('/api/v2/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecV2));
```

## Exporting Documentation

### Download OpenAPI JSON

```bash
curl http://localhost:3000/api-docs.json > openapi.json
```

### Generate Static HTML

```bash
# Install Redoc CLI
npm install -g redoc-cli

# Generate
redoc-cli bundle http://localhost:3000/api-docs.json -o api-docs.html
```

### Generate PDF

Use browser print functionality:
1. Open http://localhost:3000/api-docs
2. Expand all endpoints
3. Print to PDF

## Integration with API Clients

### Postman

1. Open Postman
2. Import → Link
3. Enter: `http://localhost:3000/api-docs.json`
4. All endpoints imported automatically

### Insomnia

1. Create → Import from → URL
2. Enter: `http://localhost:3000/api-docs.json`

### Generate Client SDKs

```bash
# Install OpenAPI Generator
npm install -g @openapitools/openapi-generator-cli

# Generate TypeScript client
openapi-generator-cli generate \
  -i http://localhost:3000/api-docs.json \
  -g typescript-axios \
  -o ./generated-client
```

## Troubleshooting

### Documentation Not Updating

**Cause**: Server needs restart to regenerate spec

**Solution**:
```bash
pkill -f dashboard
npm run dashboard
```

### Endpoint Not Appearing

**Causes**:
1. Missing `@swagger` tag
2. JSDoc comment not directly above endpoint
3. Syntax error in YAML

**Solution**:
- Check JSDoc is directly above endpoint
- Validate YAML syntax
- Check server logs for errors

### Invalid Schema Error

**Cause**: Incorrect OpenAPI syntax

**Solution**:
- Use online validator: https://editor.swagger.io
- Paste your `/api-docs.json` content
- Fix reported errors

### Can't Execute Requests (CORS)

**Cause**: CORS not enabled or misconfigured

**Solution**: Already handled in `server.ts`:
```typescript
this.app.use(cors());
```

## Examples

### Complete Endpoint Documentation

```typescript
/**
 * @swagger
 * /api/reports/{id}/export/{formCode}:
 *   get:
 *     summary: Export form variances to CSV
 *     description: Download all variances for a specific form as a CSV file
 *     tags: [Export]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report ID
 *         example: report-1700000000000-abc123
 *       - in: path
 *         name: formCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Form code
 *         example: ARF1100
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               example: |
 *                 Cell Reference,Cell Description,2025-03-31,2025-06-30,Difference
 *                 Cell_A123,Total Assets,1000000,1100000,100000
 *       404:
 *         description: Report or form not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
this.app.get('/api/reports/:id/export/:formCode', handler);
```

## Resources

- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [Swagger JSDoc Documentation](https://github.com/Surnet/swagger-jsdoc)
- [Swagger UI Express](https://github.com/scottie1984/swagger-ui-express)
- [OpenAPI Examples](https://github.com/OAI/OpenAPI-Specification/tree/main/examples)

## Maintenance

### Regular Updates

When you modify endpoints:
1. Update JSDoc comments
2. Restart server
3. Test in Swagger UI
4. Verify examples work

### Version Control

Commit changes to:
- `src/dashboard/server.ts` (endpoint changes)
- `src/dashboard/swagger.ts` (schema changes)

The OpenAPI spec is generated automatically - no need to commit it.

---

**Benefits of This Approach**:
- ✅ Documentation stays in sync with code
- ✅ Single source of truth
- ✅ Automatic updates
- ✅ Interactive testing
- ✅ Easy to maintain
- ✅ No manual API documentation needed

**Next Steps**:
1. Add JSDoc to any custom endpoints
2. Test endpoints in Swagger UI
3. Export documentation for team