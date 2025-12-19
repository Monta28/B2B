import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as sql from 'mssql';
import { AppConfig } from '../entities/app-config.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { UpdateAppConfigDto, TestSqlConnectionDto } from './dto/update-config.dto';

@Injectable()
export class AppConfigService {
  constructor(
    @InjectRepository(AppConfig)
    private appConfigRepository: Repository<AppConfig>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  private sanitizePublic(config: any) {
    const {
      companyName,
      logoUrl,
      faviconUrl,
      accentColor,
      accentHoverColor,
      accentDarkColor,
      darkBrand950,
      darkBrand900,
      darkBrand800,
      lightBrand950,
      lightBrand900,
      lightBrand800,
      themeVariablesJson,
      fontFamily,
      borderRadiusStyle,
      brandLogos,
      currencySymbol,
      decimalPlaces,
    } = config;
    return {
      companyName,
      logoUrl,
      faviconUrl,
      accentColor,
      accentHoverColor,
      accentDarkColor,
      darkBrand950,
      darkBrand900,
      darkBrand800,
      lightBrand950,
      lightBrand900,
      lightBrand800,
      themeVariablesJson,
      fontFamily,
      borderRadiusStyle,
      brandLogos,
      currencySymbol,
      decimalPlaces,
    };
  }

  async getConfig(): Promise<any> {
    let config = await this.appConfigRepository.findOne({
      where: {},
      order: { id: 'ASC' },
    });

    // Create default config if none exists
    if (!config) {
      config = this.appConfigRepository.create({
        companyName: 'MECACOMM',
        logoUrl: null,
        faviconUrl: null,
        primaryColor: '#1976d2',
        accentColor: '#3b82f6',
        accentHoverColor: '#60a5fa',
        accentDarkColor: '#2563eb',
        darkBrand950: '#0f172a',
        darkBrand900: '#1e293b',
        darkBrand800: '#334155',
        lightBrand950: '#e2e8f0',
        lightBrand900: '#cbd5e1',
        lightBrand800: '#f1f5f9',
        themeVariablesJson: null,
        fontFamily: 'Inter, \"Segoe UI\", sans-serif',
        borderRadiusStyle: '12px',
        defaultDiscount: 0,
        orderCooldownMinutes: 30,
        currencySymbol: 'TND',
        decimalPlaces: 3,
        validationCooldownSeconds: 30,
        weatherCity: 'Tunis',
        weatherCountry: 'TN',
        sqlServerPort: 1433,
        dmsSyncInterval: 5, // Default: 5 minutes
      });
      await this.appConfigRepository.save(config);
    }

    // Parse brandLogos from JSON string to array
    const result: any = { ...config };
    if (config.brandLogos) {
      try {
        result.brandLogos = JSON.parse(config.brandLogos);
      } catch {
        result.brandLogos = [];
      }
    } else {
      result.brandLogos = [];
    }

    return result;
  }

  async getPublicConfig(): Promise<any> {
    const config = await this.getConfig();
    return this.sanitizePublic(config);
  }

  async updateConfig(updateConfigDto: UpdateAppConfigDto, currentUserId: string): Promise<any> {
    // Get raw config from DB (not the parsed version)
    let config = await this.appConfigRepository.findOne({
      where: {},
      order: { id: 'ASC' },
    });

    if (!config) {
      config = this.appConfigRepository.create({});
    }

    // Prepare data for saving - convert brandLogos array to JSON string
    const dataToSave: any = { ...updateConfigDto };
    if (updateConfigDto.brandLogos && Array.isArray(updateConfigDto.brandLogos)) {
      dataToSave.brandLogos = JSON.stringify(updateConfigDto.brandLogos);
    }
    // Normalize optional theme fields to avoid undefined insertion
    if (updateConfigDto.fontFamily === undefined) delete dataToSave.fontFamily;
    if (updateConfigDto.borderRadiusStyle === undefined) delete dataToSave.borderRadiusStyle;

    Object.assign(config, dataToSave);
    let savedConfig: AppConfig;
    try {
      savedConfig = await this.appConfigRepository.save(config);
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : 'Erreur lors de la sauvegarde';
      const code = err?.code || err?.driverError?.code;

      // Postgres common codes:
      // 22001 = string_data_right_truncation (ex: base64 too long for VARCHAR)
      // 42703 = undefined_column (DB schema not migrated)
      if (code === '22001') {
        throw new BadRequestException(
          "Valeur trop longue pour la base (ex: logo/favicon en base64). Utilisez une URL ou exécutez la migration 'add-branding-theme-fields'.",
        );
      }
      if (code === '42703') {
        throw new BadRequestException(
          "La base de données n'est pas à jour avec les champs Branding/Thème. Exécutez la migration 'add-branding-theme-fields'.",
        );
      }

      throw new BadRequestException(message);
    }

    // Audit log
    await this.logAuditAction(currentUserId, 'UPDATE_CONFIG', 'AppConfig', savedConfig.id, updateConfigDto);

    // Return with parsed brandLogos
    return this.getConfig();
  }

  async testSqlConnection(testDto: TestSqlConnectionDto): Promise<{ success: boolean; message: string; tables?: string[] }> {
    // If no password provided, try to get it from saved config
    let passwordToUse = testDto.password;
    if (!passwordToUse) {
      const savedConfig = await this.getConfig();
      passwordToUse = savedConfig.sqlServerPassword || '';
    }

    // Parse server name for named instances (e.g., ".\MGSS_SQLSERVER" or "localhost\INSTANCE")
    let serverName = testDto.host;
    let instanceName: string | undefined;

    // Handle .\INSTANCE format (local named instance)
    if (serverName.startsWith('.\\') || serverName.startsWith('./')) {
      instanceName = serverName.substring(2);
      serverName = 'localhost';
    } else if (serverName.includes('\\')) {
      // Handle SERVER\INSTANCE format
      const parts = serverName.split('\\');
      serverName = parts[0];
      instanceName = parts[1];
    } else if (serverName.includes('/')) {
      // Handle SERVER/INSTANCE format
      const parts = serverName.split('/');
      serverName = parts[0];
      instanceName = parts[1];
    }

    const sqlConfig: sql.config = {
      server: serverName,
      user: testDto.user,
      password: passwordToUse,
      database: testDto.database,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        instanceName: instanceName,
      },
      connectionTimeout: 15000,
      requestTimeout: 15000,
    };

    // Only set port if no instance name (named instances use SQL Browser)
    if (!instanceName && testDto.port) {
      sqlConfig.port = testDto.port;
    }

    try {
      const pool = await sql.connect(sqlConfig);

      // Get list of tables
      const result = await pool.request().query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `);

      const tables = result.recordset.map((row: any) => row.TABLE_NAME);

      await pool.close();

      return {
        success: true,
        message: `Connexion réussie à ${testDto.database}`,
        tables,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Erreur de connexion: ${error.message}`,
      };
    }
  }

  async getSqlConnection(): Promise<sql.ConnectionPool | null> {
    const config = await this.getConfig();

    if (!config.sqlServerHost || !config.sqlServerUser || !config.sqlServerDatabase) {
      return null;
    }

    // Parse server name for named instances
    let serverName = config.sqlServerHost;
    let instanceName: string | undefined;

    if (serverName.startsWith('.\\') || serverName.startsWith('./')) {
      instanceName = serverName.substring(2);
      serverName = 'localhost';
    } else if (serverName.includes('\\')) {
      const parts = serverName.split('\\');
      serverName = parts[0];
      instanceName = parts[1];
    } else if (serverName.includes('/')) {
      const parts = serverName.split('/');
      serverName = parts[0];
      instanceName = parts[1];
    }

    const sqlConfig: sql.config = {
      server: serverName,
      user: config.sqlServerUser,
      password: config.sqlServerPassword,
      database: config.sqlServerDatabase,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        instanceName: instanceName,
      },
      connectionTimeout: 15000,
      requestTimeout: 15000,
    };

    // Only set port if no instance name
    if (!instanceName && config.sqlServerPort) {
      sqlConfig.port = config.sqlServerPort;
    }

    try {
      const pool = await sql.connect(sqlConfig);
      return pool;
    } catch (error) {
      console.error('SQL Server connection error:', error);
      return null;
    }
  }

  private async logAuditAction(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: any,
  ) {
    // Remove sensitive data from audit log
    const sanitizedDetails = { ...details };
    if (sanitizedDetails.sqlServerPassword) {
      sanitizedDetails.sqlServerPassword = '***';
    }

    const auditLog = this.auditLogRepository.create({
      userId,
      action,
      entityType,
      entityId,
      details: sanitizedDetails,
    });
    await this.auditLogRepository.save(auditLog);
  }
}
