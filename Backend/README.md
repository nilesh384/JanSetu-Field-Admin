# Backend Setup and Database Connection

## Overview
This backend uses Node.js + Express with PostgreSQL. SSL/TLS handling is configured to work with managed Postgres providers like Aiven.

## Database Connection Setup

### Environment Variables
Copy `.env.example` to `.env` and configure:

```env
PORT=4000
DATABASE_URL=postgres://username:password@hostname:port/database?sslmode=require

# Optional: Path to CA certificate for SSL verification
# PG_CA_PATH=./certs/ca.pem

# Other required variables...
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

### SSL Configuration

The database connection automatically handles SSL certificates:

1. **Production (Recommended)**: Use provider CA certificate
   - Download CA bundle from your Postgres provider (Aiven, AWS RDS, etc.)
   - Save as `Backend/certs/ca.pem`
   - Set `PG_CA_PATH=./certs/ca.pem` in `.env`
   - Restart server: `npm run dev`

2. **Development Fallback**: Disable SSL verification
   - Comment out or remove `PG_CA_PATH` from `.env`
   - Server will use `rejectUnauthorized: false` and `NODE_TLS_REJECT_UNAUTHORIZED=0`
   - ⚠️ **NOT safe for production**

### Troubleshooting Connection Issues

#### "self-signed certificate in certificate chain"
This means the CA file doesn't match the server certificate:
- Verify you downloaded the correct CA from your provider
- Ensure the CA file includes the full certificate chain
- For Aiven: Download from Console → Service Details → Connection Information

#### "getaddrinfo ENOTFOUND hostname"
DNS resolution failed:
- Check if the hostname in `DATABASE_URL` is correct
- Verify your network can reach the database (try ping/nslookup)
- Confirm the database instance exists and is running

#### "connection refused" or "timeout"
Network connectivity issues:
- Check firewall settings
- Verify the port number (usually 5432 for Postgres, varies for managed services)
- Ensure your IP is whitelisted in the provider console

### Running the Server

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Expected output:
# Using custom Postgres CA from PG_CA_PATH: /path/to/ca.pem
# Connected to PostgreSQL database
# Server running on port 4000
```

### Security Notes

- **Never commit** CA certificates or secrets to version control
- Use `PG_CA_PATH` in production for proper SSL verification
- The development fallback (`NODE_TLS_REJECT_UNAUTHORIZED=0`) is insecure
- Add `certs/` to `.gitignore` to prevent accidental commits

### API Endpoints

- `GET /api/reports/community-stats` - Community statistics
- `POST /api/reports` - Submit new report
- `GET /api/reports/nearby` - Get nearby reports
- Other endpoints documented in route files

## Development

```bash
# Install dependencies
npm install

# Start with auto-reload
npm run dev

# Start production
npm start
```