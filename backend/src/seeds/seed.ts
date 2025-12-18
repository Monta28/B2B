import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Company } from '../entities/company.entity';
import { User, UserRole } from '../entities/user.entity';
import { News, NewsType } from '../entities/news.entity';
import { AppConfig } from '../entities/app-config.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Notification } from '../entities/notification.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '123456789',
  database: process.env.DB_DATABASE || 'mecacomm_b2b',
  entities: [Company, User, News, AppConfig, Order, OrderItem, Notification, AuditLog, Cart, CartItem],
  synchronize: false,
});

async function seed() {
  console.log('🌱 Démarrage du seed...');

  try {
    await dataSource.initialize();
    console.log('✅ Connexion à la base de données établie');

    const companyRepo = dataSource.getRepository(Company);
    const userRepo = dataSource.getRepository(User);
    const newsRepo = dataSource.getRepository(News);
    const appConfigRepo = dataSource.getRepository(AppConfig);

    // Check if data already exists
    const existingUsers = await userRepo.count();
    if (existingUsers > 0) {
      console.log('⚠️  Des données existent déjà. Seed annulé.');
      await dataSource.destroy();
      return;
    }

    // Create companies
    console.log('📦 Création des entreprises...');
    const company1 = companyRepo.create({
      name: 'GARAGE DU CENTRE',
      dmsClientCode: 'CLI-4402',
      siret: '12345678901234',
      emailContact: 'contact@garagecentre.tn',
      globalDiscount: 35,
      address: '123 Avenue Habib Bourguiba, Tunis',
      phone: '+216 71 123 456',
    });

    const company2 = companyRepo.create({
      name: 'TRANSPORT LOCAUX SA',
      dmsClientCode: 'CLI-7891',
      siret: '98765432109876',
      emailContact: 'info@transportlocaux.tn',
      globalDiscount: 30,
      address: '45 Rue de la Liberté, Sousse',
      phone: '+216 73 456 789',
    });

    const company3 = companyRepo.create({
      name: 'AUTO REPAR 2000',
      dmsClientCode: 'CLI-2233',
      siret: '11223344556677',
      emailContact: 'contact@autorepar.tn',
      globalDiscount: 25,
      address: '78 Boulevard 7 Novembre, Sfax',
      phone: '+216 74 789 012',
    });

    await companyRepo.save([company1, company2, company3]);
    console.log('✅ 3 entreprises créées');

    // Create users
    console.log('👥 Création des utilisateurs...');
    const hashPassword = async (password: string) => bcrypt.hash(password, 10);

    const sysAdmin = userRepo.create({
      email: 'sysadmin@mecacomm.com',
      passwordHash: await hashPassword('sysadmin'),
      fullName: 'Administrateur Système',
      role: UserRole.SYSTEM_ADMIN,
      dmsClientCode: 'INTERNAL',
      company: null,
    });

    const partialAdmin = userRepo.create({
      email: 'partial@mecacomm.com',
      passwordHash: await hashPassword('partial'),
      fullName: 'Admin Commandes',
      role: UserRole.PARTIAL_ADMIN,
      dmsClientCode: 'INTERNAL',
      company: null,
    });

    const clientAdmin = userRepo.create({
      email: 'admin@client.com',
      passwordHash: await hashPassword('admin'),
      fullName: 'Client Admin',
      role: UserRole.CLIENT_ADMIN,
      dmsClientCode: 'CLI-4402',
      company: company1,
    });

    const clientUser = userRepo.create({
      email: 'user@client.com',
      passwordHash: await hashPassword('user'),
      fullName: 'Client Utilisateur',
      role: UserRole.CLIENT_USER,
      dmsClientCode: 'CLI-4402',
      company: company1,
    });

    await userRepo.save([sysAdmin, partialAdmin, clientAdmin, clientUser]);
    console.log('✅ 4 utilisateurs créés');

    // Create news
    console.log('📰 Création des actualités...');
    const news1 = newsRepo.create({
      title: 'Nouvelle gamme BOSCH disponible',
      content: 'Découvrez notre nouvelle gamme de filtres BOSCH avec 10% de remise sur toutes les références jusqu\'à fin du mois. Profitez de cette offre exceptionnelle pour renouveler vos stocks !',
      type: NewsType.PROMO,
      isActive: true,
    });

    const news2 = newsRepo.create({
      title: 'Maintenance prévue ce weekend',
      content: 'Une maintenance système est prévue ce samedi de 2h à 6h du matin. Le service sera temporairement indisponible pendant cette période. Nous nous excusons pour la gêne occasionnée.',
      type: NewsType.WARNING,
      isActive: true,
    });

    const news3 = newsRepo.create({
      title: 'Bienvenue sur AutoPartPro !',
      content: 'Votre nouvelle plateforme B2B pour commander vos pièces automobiles est maintenant disponible. Profitez d\'une interface intuitive et de prix compétitifs.',
      type: NewsType.INFO,
      isActive: true,
    });

    await newsRepo.save([news1, news2, news3]);
    console.log('✅ 3 actualités créées');

    // Create app config
    console.log('⚙️  Création de la configuration...');
    const appConfig = appConfigRepo.create({
      companyName: 'MECACOMM',
      primaryColor: '#1976d2',
      defaultDiscount: 0,
      orderCooldownMinutes: 30,
      weatherCity: 'Tunis',
      weatherCountry: 'TN',
      sqlServerPort: 1433,
    });

    await appConfigRepo.save(appConfig);
    console.log('✅ Configuration créée');

    console.log('\n🎉 Seed terminé avec succès !');
    console.log('\n📋 Récapitulatif:');
    console.log('   - 3 entreprises');
    console.log('   - 4 utilisateurs');
    console.log('   - 3 actualités');
    console.log('   - 1 configuration');
    console.log('\n📝 Identifiants de connexion:');
    console.log('   - sysadmin@mecacomm.com / sysadmin (Admin Système)');
    console.log('   - partial@mecacomm.com / partial (Admin Partiel)');
    console.log('   - admin@client.com / admin (Admin Client)');
    console.log('   - user@client.com / user (Utilisateur Client)');

    await dataSource.destroy();
  } catch (error) {
    console.error('❌ Erreur lors du seed:', error);
    process.exit(1);
  }
}

seed();
