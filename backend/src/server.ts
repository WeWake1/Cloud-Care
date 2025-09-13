import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';

// Import configurations and middleware
import { config } from './config/environment';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { auditLogger } from './middleware/auditLogger';
import { validateJWT } from './middleware/auth';

// Import database service
import { connectDatabase, disconnectDatabase, database } from './services/database';

// Import routes (v3 - added comprehensive healthcare features)
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import doctorRoutes from './routes/doctors';
import medicalRecordRoutes from './routes/medicalRecords';
import abhaRoutes from './routes/abha';
import qrRoutes from './routes/qr';
import dashboardRoutes from './routes/dashboard';
import medicationsRoutes from './routes/medications';
import appointmentsRoutes from './routes/appointments';
import vitalsRoutes from './routes/vitals';
import consentRoutes from './routes/consents';

// Load environment variables
dotenv.config();

class CloudCareServer {
  public app: express.Application;
  public server: any;

  constructor() {
    this.app = express();
    this.configureMiddleware();
    this.configureRoutes();
    this.configureErrorHandling();
  }

  private configureMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message: string) => logger.info(message.trim())
      }
    }));

    // Audit logging for HIPAA compliance
    this.app.use(auditLogger);

    // Trust proxy (for deployment behind load balancer)
    this.app.set('trust proxy', 1);
  }

  private configureRoutes(): void {
    // API base path
    const API_BASE = '/api/v1';

    // Health check routes (no authentication required)
    this.app.use('/health', healthRoutes);
    this.app.use('/api/health', healthRoutes);
    this.app.use(`${API_BASE}/health`, healthRoutes);

    // Authentication routes
    this.app.use(`${API_BASE}/auth`, authRoutes);

    // Protected routes (require JWT authentication)
    this.app.use(`${API_BASE}/dashboard`, validateJWT, dashboardRoutes);
    this.app.use(`${API_BASE}/patients`, validateJWT, patientRoutes);
    this.app.use(`${API_BASE}/doctors`, validateJWT, doctorRoutes);
    this.app.use(`${API_BASE}/medical-records`, validateJWT, medicalRecordRoutes);
    this.app.use(`${API_BASE}/abha`, validateJWT, abhaRoutes);
    this.app.use(`${API_BASE}/qr`, validateJWT, qrRoutes);
    
    // New comprehensive healthcare routes
    this.app.use(`${API_BASE}/medications`, validateJWT, medicationsRoutes);
    this.app.use(`${API_BASE}/appointments`, validateJWT, appointmentsRoutes);
    this.app.use(`${API_BASE}/vitals`, validateJWT, vitalsRoutes);
    this.app.use(`${API_BASE}/consents`, consentRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        message: `The requested endpoint ${req.originalUrl} does not exist`,
        timestamp: new Date().toISOString()
      });
    });
  }

  private configureErrorHandling(): void {
    // Global error handler
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Initialize database connection
      logger.info('🔌 Initializing database connection...');
      await connectDatabase();
      logger.info('✅ Database connected successfully');

      const port = process.env.PORT || config.server.port;
      const host = config.server.host;

      this.server = createServer(this.app);

      this.server.listen(port, host, () => {
        logger.info(`🚀 CloudCare Healthcare Backend Server started`);
        logger.info(`📡 Server running on ${host}:${port}`);
        logger.info(`🌍 Environment: ${config.env}`);
        logger.info(`🔒 HIPAA Compliance: ${config.security.auditLogEnabled ? 'ENABLED' : 'DISABLED'}`);
        logger.info(`🔐 PHI Encryption: ${config.security.phiEncryptionEnabled ? 'ENABLED' : 'DISABLED'}`);
        logger.info(`💾 Database: ${database.connected ? 'CONNECTED' : 'DISCONNECTED'}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', this.gracefulShutdown.bind(this));
      process.on('SIGINT', this.gracefulShutdown.bind(this));

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    logger.info(`📴 Received ${signal}. Starting graceful shutdown...`);

    // Close database connections first
    logger.info('🔌 Closing database connections...');
    await disconnectDatabase();
    logger.info('✅ Database disconnected');

    if (this.server) {
      this.server.close(() => {
        logger.info('✅ HTTP server closed');
        process.exit(0);
      });

      // Force close after 30 seconds
      setTimeout(() => {
        logger.error('❌ Force closing server after timeout');
        process.exit(1);
      }, 30000);
    }
  }
}

// Start the server
if (require.main === module) {
  const server = new CloudCareServer();
  server.start().catch((error) => {
    logger.error('Failed to start CloudCare server:', error);
    process.exit(1);
  });
}

export default CloudCareServer;
