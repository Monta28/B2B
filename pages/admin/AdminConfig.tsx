import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { SqlServerConfig } from '../../types';
import { useConfig } from '../../context/ConfigContext';
import { ConfirmModal } from '../../components/ConfirmModal';

// Types for DMS Mapping
type DmsMappingType =
  | 'articles'
  | 'clients'
  | 'commandes_entete'
  | 'commandes_detail'
  | 'factures_entete'
  | 'factures_detail'
  | 'bl_entete'
  | 'bl_detail'
  | 'tva'
  | 'positions';

interface DmsColumnInfo {
  name: string;
  dataType: string;
  maxLength: number | null;
  isNullable: boolean;
}

// Mapping type display names
const MAPPING_TYPE_LABELS: Record<DmsMappingType, string> = {
  articles: 'Articles',
  clients: 'Clients',
  commandes_entete: 'Commandes (Entête)',
  commandes_detail: 'Commandes (Détail)',
  factures_entete: 'Factures (Entête)',
  factures_detail: 'Factures (Détail)',
  bl_entete: 'Bons de Livraison (Entête)',
  bl_detail: 'Bons de Livraison (Détail)',
  tva: 'Table TVA',
  positions: 'Positions / Emplacements',
};

// Default field labels for each mapping type
const MAPPING_LABELS: Record<DmsMappingType, Record<string, string>> = {
  articles: {
    id: 'ID / Référence',
    reference: 'Référence Article',
    name: 'Désignation',
    description: 'Description',
    category: 'Famille / Catégorie',
    subCategory: 'Sous-Famille',
    brand: 'Marque',
    price: 'Prix TTC',
    stock: 'Stock',
    minStock: 'Stock Minimum',
    location: 'Position (ID → table Positions)',
    codeOrigine: 'Code Origine',
    codeTva: 'Code TVA',
  },
  clients: {
    codeClient: 'Code Client',
    raisonSociale: 'Raison Sociale',
    codeTva: 'Code TVA / SIRET',
    telephone: 'Téléphone',
    email: 'Email',
    tauxRemise: 'Taux Remise (%)',
  },
  // Commandes - Entête
  commandes_entete: {
    numCommande: 'Numéro Commande',
    dateCommande: 'Date Commande',
    codeClient: 'Code Client',
    status: 'Statut',
    totalHT: 'Total HT',
    totalTTC: 'Total TTC',
    observation: 'Observation',
  },
  // Commandes - Détail (lignes)
  commandes_detail: {
    numCommande: 'Numéro Commande',
    numLigne: 'Numéro Ligne',
    codeArticle: 'Code Article',
    designation: 'Désignation',
    quantite: 'Quantité',
    prixUnitaire: 'Prix Unitaire',
    remise: 'Remise',
    tauxTVA: 'Taux TVA',
    montantHT: 'Montant HT (calculable)',
    montantTTC: 'Montant TTC (calculable)',
  },
  // Factures - Entête
  factures_entete: {
    numFacture: 'Numéro Facture',
    dateFacture: 'Date Facture',
    codeClient: 'Code Client',
    totalHT: 'Total HT',
    totalTVA: 'Total TVA',
    totalTTC: 'Total TTC',
    resteAPayer: 'Reste à Payer',
    observation: 'Observation',
  },
  // Factures - Détail (lignes)
  factures_detail: {
    numFacture: 'Numéro Facture',
    numLigne: 'Numéro Ligne',
    numBL: 'Numéro BL (pour regroupement)',
    numCommande: 'Numéro Commande (lien)',
    dateBL: 'Date BL',
    codeArticle: 'Code Article',
    designation: 'Désignation',
    quantite: 'Quantité',
    prixUnitaire: 'Prix Unitaire',
    remise: 'Remise',
    montantHT: 'Montant HT (calculable)',
    tauxTVA: 'Taux TVA',
    montantTTC: 'Montant TTC (calculable)',
  },
  // Bons de Livraison - Entête
  bl_entete: {
    numBL: 'Numéro BL',
    dateBL: 'Date BL',
    codeClient: 'Code Client',
    numFacture: 'Numéro Facture',
    totalHT: 'Total HT',
    totalTTC: 'Total TTC',
    observation: 'Observation',
  },
  // Bons de Livraison - Détail (lignes)
  bl_detail: {
    numBL: 'Numéro BL',
    numLigne: 'Numéro Ligne',
    numCommande: 'Numéro Commande (lien)',
    codeArticle: 'Code Article',
    designation: 'Désignation',
    quantite: 'Quantité',
    prixUnitaire: 'Prix Unitaire',
    remise: 'Remise',
    tauxTVA: 'Taux TVA',
    montantHT: 'Montant HT (calculable)',
    montantTTC: 'Montant TTC (calculable)',
  },
  tva: {
    codeTva: 'Code TVA',
    taux: 'Taux (%)',
  },
  positions: {
    id: 'ID Position',
    nom: 'Nom Position',
  },
};

// Complete list of Countries and Cities for Weather
const CITIES_BY_COUNTRY: Record<string, string[]> = {
  // Afrique du Nord
  'Tunisie': ['Tunis', 'Sfax', 'Sousse', 'Gabès', 'Bizerte', 'Ariana', 'Kairouan', 'Gafsa', 'Monastir', 'La Marsa', 'Ben Arous', 'Nabeul', 'Hammamet', 'Djerba', 'Tozeur', 'Mahdia', 'Médenine', 'Tataouine', 'Kébili', 'Jendouba', 'Le Kef', 'Siliana', 'Béja', 'Zaghouan'],
  'Algérie': ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Batna', 'Djelfa', 'Sétif', 'Sidi Bel Abbès', 'Biskra', 'Tébessa', 'El Oued', 'Skikda', 'Tiaret', 'Béjaïa', 'Tlemcen', 'Ouargla', 'Béchar', 'Mostaganem', 'Ghardaïa', 'Tamanrasset'],
  'Maroc': ['Casablanca', 'Rabat', 'Fès', 'Tanger', 'Marrakech', 'Agadir', 'Meknès', 'Oujda', 'Kenitra', 'Tétouan', 'Safi', 'Mohammedia', 'El Jadida', 'Béni Mellal', 'Nador', 'Essaouira', 'Ouarzazate', 'Dakhla', 'Laâyoune'],
  'Libye': ['Tripoli', 'Benghazi', 'Misrata', 'Tarhuna', 'Zawiya', 'Zliten', 'Syrte', 'Sabha', 'Tobrouk', 'Derna'],
  'Égypte': ['Le Caire', 'Alexandrie', 'Gizeh', 'Port-Saïd', 'Suez', 'Louxor', 'Assouan', 'Charm el-Cheikh', 'Hurghada', 'Mansoura', 'Ismaïlia', 'Assiout'],
  // Afrique de l'Ouest
  'Sénégal': ['Dakar', 'Thiès', 'Kaolack', 'Ziguinchor', 'Saint-Louis', 'Mbour', 'Rufisque', 'Diourbel', 'Louga', 'Tambacounda'],
  'Côte d\'Ivoire': ['Abidjan', 'Bouaké', 'Yamoussoukro', 'Korhogo', 'San-Pédro', 'Daloa', 'Man', 'Gagnoa', 'Grand-Bassam'],
  'Mali': ['Bamako', 'Sikasso', 'Mopti', 'Koutiala', 'Kayes', 'Ségou', 'Gao', 'Tombouctou'],
  'Burkina Faso': ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou', 'Banfora', 'Ouahigouya'],
  'Niger': ['Niamey', 'Zinder', 'Maradi', 'Agadez', 'Tahoua', 'Dosso'],
  'Ghana': ['Accra', 'Kumasi', 'Tamale', 'Takoradi', 'Tema', 'Cape Coast'],
  'Nigeria': ['Lagos', 'Kano', 'Ibadan', 'Abuja', 'Port Harcourt', 'Benin City', 'Kaduna', 'Enugu', 'Calabar'],
  'Guinée': ['Conakry', 'Nzérékoré', 'Kankan', 'Kindia', 'Labé'],
  'Bénin': ['Cotonou', 'Porto-Novo', 'Parakou', 'Abomey-Calavi', 'Ouidah'],
  'Togo': ['Lomé', 'Sokodé', 'Kara', 'Kpalimé', 'Atakpamé'],
  'Mauritanie': ['Nouakchott', 'Nouadhibou', 'Néma', 'Kaédi', 'Atar'],
  'Gambie': ['Banjul', 'Serekunda', 'Brikama'],
  'Sierra Leone': ['Freetown', 'Bo', 'Kenema', 'Makeni'],
  'Liberia': ['Monrovia', 'Gbarnga', 'Buchanan'],
  'Cap-Vert': ['Praia', 'Mindelo', 'Santa Maria', 'Espargos'],
  // Afrique Centrale
  'Cameroun': ['Yaoundé', 'Douala', 'Garoua', 'Bamenda', 'Maroua', 'Bafoussam', 'Kribi', 'Limbé'],
  'République Démocratique du Congo': ['Kinshasa', 'Lubumbashi', 'Mbuji-Mayi', 'Kisangani', 'Bukavu', 'Goma', 'Matadi'],
  'République du Congo': ['Brazzaville', 'Pointe-Noire', 'Dolisie', 'Nkayi', 'Ouesso'],
  'Gabon': ['Libreville', 'Port-Gentil', 'Franceville', 'Oyem', 'Lambaréné'],
  'Tchad': ['N\'Djamena', 'Moundou', 'Sarh', 'Abéché'],
  'Centrafrique': ['Bangui', 'Bimbo', 'Berbérati', 'Bambari'],
  'Guinée équatoriale': ['Malabo', 'Bata', 'Ebebiyin'],
  // Afrique de l'Est
  'Kenya': ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Malindi', 'Lamu'],
  'Tanzanie': ['Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Zanzibar City', 'Moshi'],
  'Ouganda': ['Kampala', 'Gulu', 'Lira', 'Mbarara', 'Jinja', 'Entebbe'],
  'Rwanda': ['Kigali', 'Butare', 'Gitarama', 'Ruhengeri', 'Gisenyi'],
  'Burundi': ['Bujumbura', 'Gitega', 'Muyinga', 'Ngozi'],
  'Éthiopie': ['Addis-Abeba', 'Dire Dawa', 'Mekele', 'Gondar', 'Bahir Dar', 'Hawassa', 'Lalibela'],
  'Djibouti': ['Djibouti', 'Ali Sabieh', 'Tadjoura', 'Obock'],
  'Somalie': ['Mogadiscio', 'Hargeisa', 'Berbera', 'Kismayo', 'Bosaso'],
  'Soudan': ['Khartoum', 'Omdurman', 'Port-Soudan', 'Kassala', 'Nyala'],
  'Madagascar': ['Antananarivo', 'Toamasina', 'Antsirabe', 'Fianarantsoa', 'Mahajanga', 'Nosy Be'],
  'Maurice': ['Port-Louis', 'Beau Bassin-Rose Hill', 'Curepipe', 'Grand Baie', 'Flic en Flac'],
  'Seychelles': ['Victoria', 'Beau Vallon', 'Anse Boileau'],
  // Afrique Australe
  'Afrique du Sud': ['Johannesburg', 'Le Cap', 'Durban', 'Pretoria', 'Port Elizabeth', 'Bloemfontein', 'Stellenbosch', 'Soweto'],
  'Mozambique': ['Maputo', 'Beira', 'Nampula', 'Quelimane', 'Pemba'],
  'Zimbabwe': ['Harare', 'Bulawayo', 'Mutare', 'Victoria Falls'],
  'Zambie': ['Lusaka', 'Kitwe', 'Ndola', 'Livingstone'],
  'Malawi': ['Lilongwe', 'Blantyre', 'Mzuzu', 'Zomba'],
  'Botswana': ['Gaborone', 'Francistown', 'Maun', 'Kasane'],
  'Namibie': ['Windhoek', 'Walvis Bay', 'Swakopmund', 'Etosha'],
  'Angola': ['Luanda', 'Huambo', 'Lobito', 'Benguela', 'Lubango'],
  // Europe de l'Ouest
  'France': ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Montpellier', 'Strasbourg', 'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Toulon', 'Grenoble', 'Dijon', 'Angers', 'Nîmes', 'Aix-en-Provence', 'Clermont-Ferrand', 'Le Mans', 'Brest', 'Tours', 'Amiens', 'Limoges', 'Perpignan', 'Metz', 'Besançon', 'Orléans', 'Rouen', 'Caen', 'Nancy', 'Avignon', 'Cannes', 'Ajaccio', 'Poitiers'],
  'Belgique': ['Bruxelles', 'Anvers', 'Gand', 'Charleroi', 'Liège', 'Bruges', 'Namur', 'Louvain', 'Mons', 'Ostende'],
  'Suisse': ['Zurich', 'Genève', 'Bâle', 'Lausanne', 'Berne', 'Lucerne', 'Lugano', 'Montreux', 'Zermatt', 'Interlaken'],
  'Luxembourg': ['Luxembourg', 'Esch-sur-Alzette', 'Differdange', 'Dudelange', 'Ettelbruck'],
  'Monaco': ['Monaco', 'Monte-Carlo', 'La Condamine'],
  'Allemagne': ['Berlin', 'Hambourg', 'Munich', 'Cologne', 'Francfort', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dresde', 'Hanovre', 'Nuremberg', 'Bonn', 'Heidelberg'],
  'Pays-Bas': ['Amsterdam', 'Rotterdam', 'La Haye', 'Utrecht', 'Eindhoven', 'Maastricht', 'Groningue'],
  'Royaume-Uni': ['Londres', 'Birmingham', 'Manchester', 'Glasgow', 'Liverpool', 'Édimbourg', 'Bristol', 'Cardiff', 'Belfast', 'Brighton', 'Cambridge', 'Oxford', 'York', 'Bath'],
  'Irlande': ['Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford', 'Kilkenny'],
  'Autriche': ['Vienne', 'Graz', 'Linz', 'Salzbourg', 'Innsbruck', 'Klagenfurt'],
  // Europe du Sud
  'Espagne': ['Madrid', 'Barcelone', 'Valence', 'Séville', 'Saragosse', 'Malaga', 'Bilbao', 'Grenade', 'Cordoue', 'Ibiza', 'Palma de Majorque', 'San Sebastián', 'Tolède', 'Salamanque'],
  'Portugal': ['Lisbonne', 'Porto', 'Braga', 'Coimbra', 'Funchal', 'Faro', 'Sintra', 'Cascais', 'Lagos'],
  'Italie': ['Rome', 'Milan', 'Naples', 'Turin', 'Florence', 'Bologne', 'Venise', 'Vérone', 'Gênes', 'Palerme', 'Pise', 'Sienne', 'Amalfi', 'Ravenne', 'Cagliari'],
  'Grèce': ['Athènes', 'Thessalonique', 'Patras', 'Héraklion', 'Rhodes', 'Corfou', 'Mykonos', 'Santorin', 'Delphes'],
  'Malte': ['La Valette', 'Sliema', 'Rabat', 'Gozo', 'Mdina'],
  'Andorre': ['Andorre-la-Vieille', 'Escaldes-Engordany', 'Encamp'],
  'Chypre': ['Nicosie', 'Limassol', 'Larnaca', 'Paphos', 'Ayia Napa'],
  // Europe du Nord
  'Danemark': ['Copenhague', 'Aarhus', 'Odense', 'Aalborg', 'Roskilde'],
  'Suède': ['Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Kiruna', 'Visby'],
  'Norvège': ['Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Tromsø', 'Narvik', 'Longyearbyen'],
  'Finlande': ['Helsinki', 'Espoo', 'Tampere', 'Turku', 'Oulu', 'Rovaniemi'],
  'Islande': ['Reykjavik', 'Akureyri', 'Ísafjörður', 'Húsavík'],
  'Estonie': ['Tallinn', 'Tartu', 'Pärnu', 'Narva'],
  'Lettonie': ['Riga', 'Daugavpils', 'Liepāja', 'Jūrmala'],
  'Lituanie': ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai'],
  // Europe de l'Est
  'Pologne': ['Varsovie', 'Cracovie', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Lublin'],
  'République tchèque': ['Prague', 'Brno', 'Ostrava', 'Plzeň', 'Karlovy Vary', 'Český Krumlov'],
  'Slovaquie': ['Bratislava', 'Košice', 'Prešov', 'Žilina'],
  'Hongrie': ['Budapest', 'Debrecen', 'Szeged', 'Pécs', 'Eger'],
  'Roumanie': ['Bucarest', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Brașov', 'Sibiu', 'Bran'],
  'Bulgarie': ['Sofia', 'Plovdiv', 'Varna', 'Bourgas', 'Veliko Tarnovo', 'Bansko', 'Nessebar'],
  'Moldavie': ['Chișinău', 'Tiraspol', 'Bălți'],
  'Ukraine': ['Kiev', 'Kharkiv', 'Odessa', 'Lviv', 'Dnipro'],
  'Biélorussie': ['Minsk', 'Gomel', 'Moguilev', 'Vitebsk', 'Brest'],
  'Russie': ['Moscou', 'Saint-Pétersbourg', 'Novossibirsk', 'Iekaterinbourg', 'Kazan', 'Sotchi', 'Vladivostok', 'Kaliningrad', 'Mourmansk'],
  // Europe du Sud-Est
  'Slovénie': ['Ljubljana', 'Maribor', 'Bled', 'Piran'],
  'Croatie': ['Zagreb', 'Split', 'Rijeka', 'Dubrovnik', 'Zadar', 'Pula'],
  'Bosnie-Herzégovine': ['Sarajevo', 'Banja Luka', 'Mostar', 'Tuzla'],
  'Serbie': ['Belgrade', 'Novi Sad', 'Niš'],
  'Monténégro': ['Podgorica', 'Budva', 'Kotor', 'Herceg Novi'],
  'Kosovo': ['Pristina', 'Prizren'],
  'Macédoine du Nord': ['Skopje', 'Ohrid', 'Bitola'],
  'Albanie': ['Tirana', 'Durrës', 'Vlorë', 'Shkodër', 'Berat', 'Gjirokastër', 'Sarandë'],
  // Asie de l'Ouest (Moyen-Orient)
  'Turquie': ['Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Antalya', 'Bodrum', 'Cappadoce', 'Pamukkale', 'Ephèse', 'Trabzon'],
  'Arabie saoudite': ['Riyad', 'Djeddah', 'La Mecque', 'Médine', 'Dammam', 'Tabuk'],
  'Émirats arabes unis': ['Dubaï', 'Abou Dabi', 'Charjah', 'Al Aïn', 'Ras el Khaïmah', 'Fujaïrah'],
  'Qatar': ['Doha', 'Al Wakrah', 'Al Khor'],
  'Koweït': ['Koweït City', 'Al Ahmadi', 'Hawalli'],
  'Bahreïn': ['Manama', 'Riffa', 'Muharraq'],
  'Oman': ['Mascate', 'Salalah', 'Sohar', 'Nizwa', 'Musandam'],
  'Yémen': ['Sanaa', 'Aden', 'Taïz', 'Hodeïda'],
  'Jordanie': ['Amman', 'Zarqa', 'Irbid', 'Aqaba', 'Petra', 'Wadi Rum'],
  'Liban': ['Beyrouth', 'Tripoli', 'Sidon', 'Tyr', 'Byblos', 'Baalbek'],
  'Syrie': ['Damas', 'Alep', 'Homs', 'Lattaquié', 'Palmyre'],
  'Irak': ['Bagdad', 'Bassora', 'Mossoul', 'Erbil', 'Kirkouk', 'Nadjaf', 'Karbala', 'Babylone'],
  'Iran': ['Téhéran', 'Mashhad', 'Ispahan', 'Chiraz', 'Tabriz', 'Yazd', 'Persépolis'],
  'Israël': ['Tel Aviv', 'Jérusalem', 'Haïfa', 'Eilat', 'Nazareth', 'Acre', 'Césarée'],
  'Palestine': ['Gaza', 'Ramallah', 'Hébron', 'Bethléem', 'Naplouse', 'Jéricho'],
  'Géorgie': ['Tbilissi', 'Batoumi', 'Koutaïssi', 'Mtskheta'],
  'Arménie': ['Erevan', 'Gyumri', 'Dilijan', 'Goris'],
  'Azerbaïdjan': ['Bakou', 'Gandja', 'Şəki', 'Qobustan'],
  // Asie du Sud
  'Inde': ['New Delhi', 'Bombay', 'Bangalore', 'Chennai', 'Calcutta', 'Hyderabad', 'Jaipur', 'Agra', 'Varanasi', 'Goa', 'Udaipur', 'Darjeeling', 'Rishikesh', 'Amritsar', 'Jodhpur'],
  'Pakistan': ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Peshawar', 'Quetta'],
  'Bangladesh': ['Dhaka', 'Chittagong', 'Khulna', 'Sylhet', 'Cox\'s Bazar'],
  'Sri Lanka': ['Colombo', 'Kandy', 'Galle', 'Nuwara Eliya', 'Sigiriya', 'Anuradhapura'],
  'Népal': ['Katmandou', 'Pokhara', 'Lalitpur', 'Chitwan', 'Lumbini', 'Namche Bazaar'],
  'Bhoutan': ['Thimphou', 'Paro', 'Punakha', 'Bumthang'],
  'Maldives': ['Malé', 'Addu City', 'Hulhumalé'],
  'Afghanistan': ['Kaboul', 'Kandahar', 'Hérat', 'Mazar-i-Sharif', 'Bamyan'],
  // Asie de l'Est
  'Chine': ['Pékin', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Hong Kong', 'Chengdu', 'Xi\'an', 'Hangzhou', 'Guilin', 'Lhassa', 'Macao', 'Lijiang', 'Zhangjiajie'],
  'Japon': ['Tokyo', 'Osaka', 'Kyoto', 'Nagoya', 'Sapporo', 'Fukuoka', 'Hiroshima', 'Nara', 'Kanazawa', 'Nikko', 'Okinawa', 'Hakone', 'Kamakura'],
  'Corée du Sud': ['Séoul', 'Busan', 'Incheon', 'Daegu', 'Jeju', 'Gyeongju'],
  'Corée du Nord': ['Pyongyang', 'Hamhung', 'Kaesong'],
  'Taïwan': ['Taipei', 'Kaohsiung', 'Taichung', 'Tainan', 'Jiufen', 'Taroko'],
  'Mongolie': ['Oulan-Bator', 'Erdenet', 'Darkhan'],
  // Asie du Sud-Est
  'Thaïlande': ['Bangkok', 'Chiang Mai', 'Pattaya', 'Phuket', 'Krabi', 'Koh Samui', 'Ayutthaya', 'Sukhothai', 'Pai', 'Hua Hin'],
  'Vietnam': ['Hô Chi Minh-Ville', 'Hanoï', 'Da Nang', 'Hoi An', 'Huế', 'Nha Trang', 'Ha Long', 'Sa Pa', 'Phú Quốc', 'Da Lat'],
  'Indonésie': ['Jakarta', 'Bali', 'Yogyakarta', 'Surabaya', 'Bandung', 'Ubud', 'Lombok', 'Komodo', 'Raja Ampat'],
  'Malaisie': ['Kuala Lumpur', 'George Town', 'Malacca', 'Langkawi', 'Kota Kinabalu', 'Cameron Highlands', 'Bornéo'],
  'Singapour': ['Singapour'],
  'Philippines': ['Manille', 'Cebu', 'Davao', 'Boracay', 'Palawan', 'Bohol', 'Baguio', 'Siargao'],
  'Myanmar': ['Rangoun', 'Mandalay', 'Bagan', 'Inle', 'Ngapali'],
  'Cambodge': ['Phnom Penh', 'Siem Reap', 'Sihanoukville', 'Kampot', 'Battambang', 'Angkor'],
  'Laos': ['Vientiane', 'Luang Prabang', 'Vang Vieng', 'Paksé'],
  'Brunei': ['Bandar Seri Begawan'],
  'Timor oriental': ['Dili', 'Baucau'],
  // Asie centrale
  'Kazakhstan': ['Almaty', 'Astana', 'Chymkent'],
  'Ouzbékistan': ['Tachkent', 'Samarcande', 'Boukhara', 'Khiva'],
  'Turkménistan': ['Achgabat', 'Mary', 'Merv'],
  'Tadjikistan': ['Douchanbé', 'Khodjent', 'Panjakent'],
  'Kirghizistan': ['Bichkek', 'Och', 'Karakol', 'Issyk-Koul'],
  // Océanie
  'Australie': ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adélaïde', 'Gold Coast', 'Canberra', 'Cairns', 'Darwin', 'Hobart', 'Great Barrier Reef', 'Uluru', 'Byron Bay', 'Tasmania'],
  'Nouvelle-Zélande': ['Auckland', 'Wellington', 'Christchurch', 'Queenstown', 'Rotorua', 'Milford Sound', 'Hobbiton', 'Fiordland'],
  'Fidji': ['Suva', 'Nadi', 'Denarau', 'Mamanuca'],
  'Polynésie française': ['Papeete', 'Bora Bora', 'Moorea', 'Tahiti'],
  'Nouvelle-Calédonie': ['Nouméa', 'Lifou', 'Îles des Pins'],
  'Samoa': ['Apia'],
  'Tonga': ['Nuku\'alofa'],
  'Vanuatu': ['Port-Vila', 'Luganville'],
  // Amérique du Nord
  'États-Unis': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'San Francisco', 'Las Vegas', 'Miami', 'Seattle', 'Boston', 'Denver', 'Washington D.C.', 'Atlanta', 'Nashville', 'La Nouvelle-Orléans', 'Orlando', 'San Diego', 'Portland', 'Hawaï', 'Anchorage'],
  'Canada': ['Toronto', 'Montréal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Québec', 'Winnipeg', 'Halifax', 'Victoria', 'Banff', 'Whistler', 'Niagara Falls'],
  'Mexique': ['Mexico', 'Guadalajara', 'Monterrey', 'Cancún', 'Acapulco', 'Puerto Vallarta', 'Playa del Carmen', 'Oaxaca', 'Guanajuato', 'Tulum', 'Mérida', 'San Miguel de Allende'],
  // Amérique centrale
  'Guatemala': ['Guatemala City', 'Antigua', 'Tikal', 'Panajachel'],
  'Belize': ['Belize City', 'San Pedro', 'Placencia', 'Caye Caulker'],
  'Honduras': ['Tegucigalpa', 'San Pedro Sula', 'Roatán', 'Copán Ruinas'],
  'El Salvador': ['San Salvador', 'Santa Ana', 'La Libertad'],
  'Nicaragua': ['Managua', 'León', 'Granada', 'San Juan del Sur', 'Ometepe'],
  'Costa Rica': ['San José', 'La Fortuna', 'Monteverde', 'Manuel Antonio', 'Tamarindo', 'Puerto Viejo'],
  'Panama': ['Panama City', 'Bocas del Toro', 'Boquete', 'San Blas'],
  // Caraïbes
  'Cuba': ['La Havane', 'Varadero', 'Trinidad', 'Viñales', 'Santiago de Cuba', 'Cienfuegos'],
  'Haïti': ['Port-au-Prince', 'Cap-Haïtien', 'Jacmel'],
  'République dominicaine': ['Saint-Domingue', 'Punta Cana', 'Puerto Plata', 'Samaná', 'La Romana'],
  'Jamaïque': ['Kingston', 'Montego Bay', 'Negril', 'Ocho Rios', 'Port Antonio'],
  'Porto Rico': ['San Juan', 'Ponce', 'Vieques', 'Culebra'],
  'Bahamas': ['Nassau', 'Freeport', 'Exuma', 'Harbour Island'],
  'Trinité-et-Tobago': ['Port-d\'Espagne', 'Scarborough', 'Tobago'],
  'Barbade': ['Bridgetown', 'Oistins', 'Holetown'],
  'Sainte-Lucie': ['Castries', 'Soufrière', 'Rodney Bay'],
  'Martinique': ['Fort-de-France', 'Saint-Pierre', 'Les Trois-Îlets', 'Sainte-Anne'],
  'Guadeloupe': ['Pointe-à-Pitre', 'Basse-Terre', 'Saint-François', 'Deshaies', 'Marie-Galante'],
  'Aruba': ['Oranjestad', 'Palm Beach', 'Eagle Beach'],
  'Curaçao': ['Willemstad'],
  // Amérique du Sud
  'Brésil': ['São Paulo', 'Rio de Janeiro', 'Brasilia', 'Salvador', 'Fortaleza', 'Recife', 'Manaus', 'Florianópolis', 'Foz do Iguaçu', 'Búzios', 'Paraty', 'Fernando de Noronha'],
  'Argentine': ['Buenos Aires', 'Córdoba', 'Mendoza', 'Bariloche', 'Ushuaia', 'El Calafate', 'Salta', 'Puerto Iguazú', 'Mar del Plata'],
  'Colombie': ['Bogota', 'Medellín', 'Carthagène des Indes', 'Cali', 'Barranquilla', 'Santa Marta', 'San Andrés', 'Leticia'],
  'Pérou': ['Lima', 'Cusco', 'Machu Picchu', 'Arequipa', 'Nazca', 'Iquitos', 'Puno', 'Huaraz'],
  'Venezuela': ['Caracas', 'Maracaibo', 'Mérida', 'Isla Margarita', 'Canaima', 'Los Roques'],
  'Chili': ['Santiago', 'Valparaíso', 'Île de Pâques', 'San Pedro de Atacama', 'Puerto Varas', 'Torres del Paine', 'Punta Arenas'],
  'Équateur': ['Quito', 'Guayaquil', 'Cuenca', 'Galápagos', 'Baños', 'Otavalo'],
  'Bolivie': ['La Paz', 'Santa Cruz', 'Sucre', 'Uyuni', 'Copacabana', 'Potosí'],
  'Paraguay': ['Asunción', 'Ciudad del Este', 'Encarnación'],
  'Uruguay': ['Montevideo', 'Punta del Este', 'Colonia del Sacramento'],
  'Guyane': ['Georgetown', 'Kaieteur Falls'],
  'Suriname': ['Paramaribo'],
  'Guyane française': ['Cayenne', 'Kourou', 'Saint-Laurent-du-Maroni'],
  // Autre
  'Autre': [] // Special case for manual input
};

// Tab configuration
type ConfigTab = 'branding' | 'company' | 'system' | 'dms' | 'mapping';

const TAB_LABELS: Record<ConfigTab, { label: string; icon: string }> = {
  branding: { label: 'Branding & Thème', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
  company: { label: 'Informations Société', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  system: { label: 'Paramètres Système', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  dms: { label: 'Connexion DMS', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
  mapping: { label: 'Mappage Tables', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2' },
};

export const AdminConfig = () => {
  const queryClient = useQueryClient();
  const { config: appConfig, updateConfig } = useConfig();
  const [activeTab, setActiveTab] = useState<ConfigTab>('branding');
  const [config, setConfig] = useState<SqlServerConfig>({ host: '', port: 1433, database: '', user: '', encrypted: false, syncInterval: 5 });
  const [catalogLoadMode, setCatalogLoadMode] = useState<'auto' | 'search'>('auto');
  const [password, setPassword] = useState('');

  const [currency, setCurrency] = useState('');
  const [decimals, setDecimals] = useState(0);
  const [cooldown, setCooldown] = useState(30);
  const [logos, setLogos] = useState<string[]>([]);

  // Branding / Theme
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [faviconUrl, setFaviconUrl] = useState<string | undefined>(undefined);
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [accentHoverColor, setAccentHoverColor] = useState('#60a5fa');
  const [accentDarkColor, setAccentDarkColor] = useState('#2563eb');
  const [darkBrand950, setDarkBrand950] = useState('#0f172a');
  const [darkBrand900, setDarkBrand900] = useState('#1e293b');
  const [darkBrand800, setDarkBrand800] = useState('#334155');
  const [lightBrand950, setLightBrand950] = useState('#e2e8f0');
  const [lightBrand900, setLightBrand900] = useState('#cbd5e1');
  const [lightBrand800, setLightBrand800] = useState('#f1f5f9');
  const [themeVariablesJson, setThemeVariablesJson] = useState('');
  const [fontFamily, setFontFamily] = useState('Inter, "Segoe UI", sans-serif');
  const [borderRadius, setBorderRadius] = useState('12px');
  const [fontSize, setFontSize] = useState('14px');

  const fontFamilyOptions = [
    'Inter, "Segoe UI", sans-serif',
    '"Roboto", "Segoe UI", sans-serif',
    '"Poppins", "Segoe UI", sans-serif',
    '"Montserrat", "Segoe UI", sans-serif',
    '"Open Sans", "Segoe UI", sans-serif',
  ];
  const fontSizeOptions = ['13px', '14px', '15px', '16px'];
  const radiusOptions = ['8px', '12px', '16px', '24px', '9999px'];

  // Weather Location State
  const [selectedCountry, setSelectedCountry] = useState('Tunisie');
  const [selectedCity, setSelectedCity] = useState('Tunis');
  const [customCity, setCustomCity] = useState('');

  // Company Details for Documents
  const [companyLegalName, setCompanyLegalName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPostalCode, setCompanyPostalCode] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyCountry, setCompanyCountry] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyFax, setCompanyFax] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [companyTaxId, setCompanyTaxId] = useState('');
  const [companyRegistration, setCompanyRegistration] = useState('');
  const [companyCapital, setCompanyCapital] = useState('');
  const [companyBankName, setCompanyBankName] = useState('');
  const [companyBankRib, setCompanyBankRib] = useState('');
  const [documentLogoUrl, setDocumentLogoUrl] = useState<string | undefined>(undefined);
  const [documentFooterText, setDocumentFooterText] = useState('');

  const [showConfigConfirm, setShowConfigConfirm] = useState(false);
  const [showSqlConfirm, setShowSqlConfirm] = useState(false);

  // SQL Connection Test State
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  // DMS Mapping State
  const [selectedMappingType, setSelectedMappingType] = useState<DmsMappingType>('articles');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableColumns, setTableColumns] = useState<DmsColumnInfo[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { data } = useQuery({ queryKey: ['sql-config'], queryFn: api.admin.getSqlConfig });

  // Query for DMS tables
  const { data: dmsTables = [], isLoading: loadingTables } = useQuery({
    queryKey: ['dms-tables'],
    queryFn: api.admin.getDmsTables,
    enabled: !!config.host && !!config.database,
  });

  // Query for existing mapping
  const { data: existingMapping, refetch: refetchMapping } = useQuery({
    queryKey: ['dms-mapping', selectedMappingType],
    queryFn: () => api.admin.getDmsMappingByType(selectedMappingType),
  });

  // Load columns when table is selected
  const loadTableColumns = async (tableName: string) => {
    if (!tableName) {
      setTableColumns([]);
      return;
    }
    setLoadingColumns(true);
    try {
      const columns = await api.admin.getDmsTableColumns(tableName);
      setTableColumns(columns);
    } catch {
      setTableColumns([]);
    } finally {
      setLoadingColumns(false);
    }
  };

  // Load preview data
  const loadPreviewData = async () => {
    if (!selectedTable || Object.keys(columnMappings).length === 0) return;
    setLoadingPreview(true);
    try {
      const data = await api.admin.previewDmsData(selectedTable, columnMappings);
      setPreviewData(data);
    } catch {
      setPreviewData([]);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Save mapping
  const saveMapping = async () => {
    if (!selectedTable) {
      toast.error('Veuillez sélectionner une table.');
      return;
    }
    setSavingMapping(true);
    try {
      await api.admin.saveDmsMapping({
        mappingType: selectedMappingType,
        dmsTableName: selectedTable,
        columnMappings,
      });
      toast.success('Mapping sauvegardé avec succès!');
      refetchMapping();
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setSavingMapping(false);
    }
  };

  // Effect to load existing mapping when type changes
  useEffect(() => {
    if (existingMapping) {
      setSelectedTable(existingMapping.dmsTableName || '');
      setColumnMappings(existingMapping.columnMappings || {});
      if (existingMapping.dmsTableName) {
        loadTableColumns(existingMapping.dmsTableName);
      }
    } else {
      // Load default mappings
      api.admin.getDmsDefaultFields(selectedMappingType).then(defaults => {
        setColumnMappings(defaults);
      }).catch(() => {});
    }
  }, [existingMapping, selectedMappingType]);

  // Effect to load columns when table changes
  useEffect(() => {
    if (selectedTable) {
      loadTableColumns(selectedTable);
    }
  }, [selectedTable]);

  // Get available fields for current mapping type
  const availableFields = useMemo(() => {
    return Object.keys(MAPPING_LABELS[selectedMappingType] || {});
  }, [selectedMappingType]);

  useEffect(() => {
    if (data) {
      setConfig(data);
      setCatalogLoadMode(data.catalogLoadMode || 'auto');
    }
    setCurrency(appConfig.currencySymbol);
    setDecimals(appConfig.decimalPlaces);
    setCooldown(appConfig.validationCooldownSeconds);
    setLogos(appConfig.brandLogos || []);

    setCompanyName(appConfig.companyName || '');
    setLogoUrl(appConfig.logoUrl);
    setFaviconUrl(appConfig.faviconUrl);
    setAccentColor(appConfig.accentColor || '#3b82f6');
    setAccentHoverColor(appConfig.accentHoverColor || '#60a5fa');
    setAccentDarkColor(appConfig.accentDarkColor || '#2563eb');
    setDarkBrand950(appConfig.darkBrand950 || '#0f172a');
    setDarkBrand900(appConfig.darkBrand900 || '#1e293b');
    setDarkBrand800(appConfig.darkBrand800 || '#334155');
    setLightBrand950(appConfig.lightBrand950 || '#e2e8f0');
    setLightBrand900(appConfig.lightBrand900 || '#cbd5e1');
    setLightBrand800(appConfig.lightBrand800 || '#f1f5f9');
    setThemeVariablesJson(appConfig.themeVariablesJson || '');
    setFontFamily(appConfig.fontFamily || 'Inter, "Segoe UI", sans-serif');
    setBorderRadius(appConfig.borderRadiusStyle || '12px');
    // Extraire une taille de police depuis le JSON avancé si prŽsent
    if (appConfig.themeVariablesJson) {
      try {
        const parsed = JSON.parse(appConfig.themeVariablesJson);
        if (parsed['--app-font-size']) setFontSize(parsed['--app-font-size']);
      } catch {
        setFontSize('14px');
      }
    } else {
      setFontSize('14px');
    }
    
    // Parse existing location (Format: "City, Country" or just "City")
    if (appConfig.weatherLocation) {
      const parts = appConfig.weatherLocation.split(', ');
      if (parts.length === 2) {
        const city = parts[0];
        const country = parts[1];
        if (CITIES_BY_COUNTRY[country] && CITIES_BY_COUNTRY[country].includes(city)) {
          setSelectedCountry(country);
          setSelectedCity(city);
        } else {
          setSelectedCountry('Autre');
          setCustomCity(appConfig.weatherLocation);
        }
      } else {
        // Fallback search
        const foundCountry = Object.keys(CITIES_BY_COUNTRY).find(c => CITIES_BY_COUNTRY[c].includes(appConfig.weatherLocation!));
        if (foundCountry) {
          setSelectedCountry(foundCountry);
          setSelectedCity(appConfig.weatherLocation!);
        } else {
          setSelectedCountry('Autre');
          setCustomCity(appConfig.weatherLocation!);
        }
      }
    }

    // Company details
    setCompanyLegalName(appConfig.companyLegalName || '');
    setCompanyAddress(appConfig.companyAddress || '');
    setCompanyPostalCode(appConfig.companyPostalCode || '');
    setCompanyCity(appConfig.companyCity || '');
    setCompanyCountry(appConfig.companyCountry || '');
    setCompanyPhone(appConfig.companyPhone || '');
    setCompanyFax(appConfig.companyFax || '');
    setCompanyEmail(appConfig.companyEmail || '');
    setCompanyWebsite(appConfig.companyWebsite || '');
    setCompanyTaxId(appConfig.companyTaxId || '');
    setCompanyRegistration(appConfig.companyRegistration || '');
    setCompanyCapital(appConfig.companyCapital || '');
    setCompanyBankName(appConfig.companyBankName || '');
    setCompanyBankRib(appConfig.companyBankRib || '');
    setDocumentLogoUrl(appConfig.documentLogoUrl);
    setDocumentFooterText(appConfig.documentFooterText || '');
  }, [data, appConfig]);

  const mutation = useMutation({ mutationFn: api.admin.updateSqlConfig, onSuccess: () => toast.success('Configuration SQL sauvegardée avec succès.') });

  const confirmAppConfigSubmit = async () => {
    let finalLocation = '';
    if (selectedCountry === 'Autre') {
      finalLocation = customCity;
    } else {
      finalLocation = `${selectedCity}, ${selectedCountry}`;
    }
    // Merge themeVariablesJson with fontSize helper
    let mergedThemeJson: string | undefined = themeVariablesJson || undefined;
    try {
      const parsed = themeVariablesJson ? JSON.parse(themeVariablesJson) : {};
      if (fontSize) parsed['--app-font-size'] = fontSize;
      mergedThemeJson = JSON.stringify(parsed);
    } catch {
      // si JSON saisi manuellement invalide, on n'y touche pas
      if (fontSize) {
        mergedThemeJson = JSON.stringify({ '--app-font-size': fontSize });
      }
    }

    try {
      await updateConfig({
        companyName: companyName || undefined,
        logoUrl: logoUrl || undefined,
        faviconUrl: faviconUrl || undefined,
        accentColor,
        accentHoverColor,
        accentDarkColor,
        darkBrand950,
        darkBrand900,
        darkBrand800,
        lightBrand950,
        lightBrand900,
        lightBrand800,
        themeVariablesJson: mergedThemeJson || undefined,
        fontFamily: fontFamily || undefined,
        borderRadiusStyle: borderRadius || undefined,
        currencySymbol: currency,
        decimalPlaces: decimals,
        validationCooldownSeconds: cooldown,
        brandLogos: logos,
        weatherLocation: finalLocation,
        // Company details for documents
        companyLegalName: companyLegalName || undefined,
        companyAddress: companyAddress || undefined,
        companyPostalCode: companyPostalCode || undefined,
        companyCity: companyCity || undefined,
        companyCountry: companyCountry || undefined,
        companyPhone: companyPhone || undefined,
        companyFax: companyFax || undefined,
        companyEmail: companyEmail || undefined,
        companyWebsite: companyWebsite || undefined,
        companyTaxId: companyTaxId || undefined,
        companyRegistration: companyRegistration || undefined,
        companyCapital: companyCapital || undefined,
        companyBankName: companyBankName || undefined,
        companyBankRib: companyBankRib || undefined,
        documentLogoUrl: documentLogoUrl || undefined,
        documentFooterText: documentFooterText || undefined,
      });
      setThemeVariablesJson(mergedThemeJson || '');
      toast.success('Configuration mise à jour.');
    } catch (err: any) {
      toast.error(err?.message || "Échec de la mise à jour de la configuration.");
      throw err;
    }
  };

  const readFileAsDataUrl = (file: File, onDone: (dataUrl: string) => void) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') onDone(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFileAsDataUrl(file, (dataUrl) => setLogoUrl(dataUrl));
  };

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFileAsDataUrl(file, (dataUrl) => setFaviconUrl(dataUrl));
  };

  const handleDocumentLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFileAsDataUrl(file, (dataUrl) => setDocumentLogoUrl(dataUrl));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => { if (reader.result) setLogos(prev => [...prev, reader.result as string]); };
        reader.readAsDataURL(file as Blob);
      });
    }
  };

  const handleSqlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSqlConfirm(true);
  };

  const confirmSqlSubmit = () => {
    mutation.mutate({ ...config, password, catalogLoadMode });
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const result = await api.admin.testSqlConnection({ ...config, password });
      setConnectionTestResult(result);
    } catch {
      setConnectionTestResult({ success: false, message: 'Erreur lors du test de connexion.' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleAppConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowConfigConfirm(true);
  };

  return (
    <div className="max-w-[1800px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Configuration Globale</h1>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 p-1 bg-brand-900/40 rounded-xl border border-accent/10">
        {(Object.keys(TAB_LABELS) as ConfigTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-accent text-white shadow-glow'
                : 'text-slate-300 hover:text-white hover:bg-brand-800/60'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TAB_LABELS[tab].icon} />
            </svg>
            {TAB_LABELS[tab].label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'branding' && (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-200">Branding & Thème</h2>
        <form onSubmit={handleAppConfigSubmit} className="card-futuristic p-6 rounded-2xl shadow-card border border-accent/10 space-y-6">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-300">Nom de l'application</label>
              <input
                type="text"
                className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Ex: MECACOMM B2B"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-accent/10 rounded-xl p-4 bg-brand-900/30">
                <label className="block text-sm font-medium text-slate-300 mb-2">Logo (sidebar/login)</label>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-accent/10 file:text-accent hover:file:bg-accent/20"/>
                {logoUrl && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-accent/20 bg-brand-900/30 p-2">
                    <img src={logoUrl} alt="Logo" className="h-10 w-auto object-contain" />
                    <button type="button" onClick={() => setLogoUrl(undefined)} className="text-xs text-neon-pink hover:text-neon-pink/80">Supprimer</button>
                  </div>
                )}
                <div className="mt-2">
                  <label className="block text-xs text-slate-500">Ou URL du logo</label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                    value={logoUrl || ''}
                    onChange={e => setLogoUrl(e.target.value || undefined)}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="border border-accent/10 rounded-xl p-4 bg-brand-900/30">
                <label className="block text-sm font-medium text-slate-300 mb-2">Favicon (onglet navigateur)</label>
                <input type="file" accept="image/png,image/svg+xml,image/x-icon" onChange={handleFaviconUpload} className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-accent/10 file:text-accent hover:file:bg-accent/20"/>
                {faviconUrl && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-accent/20 bg-brand-900/30 p-2">
                    <img src={faviconUrl} alt="Favicon" className="h-8 w-8 object-contain" />
                    <button type="button" onClick={() => setFaviconUrl(undefined)} className="text-xs text-neon-pink hover:text-neon-pink/80">Supprimer</button>
                  </div>
                )}
                <div className="mt-2">
                  <label className="block text-xs text-slate-500">Ou URL du favicon</label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                    value={faviconUrl || ''}
                    onChange={e => setFaviconUrl(e.target.value || undefined)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Accent</label>
                <input type="color" className="mt-1 block w-full h-10 rounded-md border border-accent/20 bg-brand-800/60" value={accentColor} onChange={e => setAccentColor(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Accent hover</label>
                <input type="color" className="mt-1 block w-full h-10 rounded-md border border-accent/20 bg-brand-800/60" value={accentHoverColor} onChange={e => setAccentHoverColor(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Accent dark</label>
                <input type="color" className="mt-1 block w-full h-10 rounded-md border border-accent/20 bg-brand-800/60" value={accentDarkColor} onChange={e => setAccentDarkColor(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Police (font-family)</label>
                <select
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={fontFamily}
                  onChange={e => setFontFamily(e.target.value)}
                >
                  {fontFamilyOptions.map(opt => (
                    <option key={opt} value={opt}>{opt.split(',')[0].replace(/\"/g, '')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Taille police (px)</label>
                <select
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={fontSize}
                  onChange={e => setFontSize(e.target.value)}
                >
                  {fontSizeOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Arrondi des boutons/menus</label>
                <select
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={borderRadius}
                  onChange={e => setBorderRadius(e.target.value)}
                >
                  {radiusOptions.map(opt => (
                    <option key={opt} value={opt}>{opt === '9999px' ? 'Full (pill)' : opt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-accent/10 rounded-xl p-4 bg-brand-900/30">
                <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Dark palette</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-xs text-slate-500">Brand 950</label><input type="color" className="mt-1 block w-full h-10 rounded-md border border-accent/20 bg-brand-800/60" value={darkBrand950} onChange={e => setDarkBrand950(e.target.value)} /></div>
                  <div><label className="block text-xs text-slate-500">Brand 900</label><input type="color" className="mt-1 block w-full h-10 rounded-md border border-accent/20 bg-brand-800/60" value={darkBrand900} onChange={e => setDarkBrand900(e.target.value)} /></div>
                  <div><label className="block text-xs text-slate-500">Brand 800</label><input type="color" className="mt-1 block w-full h-10 rounded-md border border-accent/20 bg-brand-800/60" value={darkBrand800} onChange={e => setDarkBrand800(e.target.value)} /></div>
                </div>
              </div>
              <div className="border border-accent/10 rounded-xl p-4 bg-brand-900/30">
                <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Light palette</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-xs text-slate-500">Brand 950</label><input type="color" className="mt-1 block w-full h-10 rounded-md border border-accent/20 bg-brand-800/60" value={lightBrand950} onChange={e => setLightBrand950(e.target.value)} /></div>
                  <div><label className="block text-xs text-slate-500">Brand 900</label><input type="color" className="mt-1 block w-full h-10 rounded-md border border-accent/20 bg-brand-800/60" value={lightBrand900} onChange={e => setLightBrand900(e.target.value)} /></div>
                  <div><label className="block text-xs text-slate-500">Brand 800</label><input type="color" className="mt-1 block w-full h-10 rounded-md border border-accent/20 bg-brand-800/60" value={lightBrand800} onChange={e => setLightBrand800(e.target.value)} /></div>
                </div>
              </div>
            </div>

            <div className="border border-accent/10 rounded-xl p-4 bg-brand-900/30">
              <label className="block text-sm font-medium text-slate-300 mb-2">Variables CSS avancées (JSON)</label>
              <p className="text-xs text-slate-500 mb-2">Clés doivent commencer par <span className="font-mono">--</span> (ex: <span className="font-mono">{'{"--radius":"10px"}'}</span>)</p>
              <textarea
                className="w-full min-h-[110px] border border-accent/20 bg-brand-800/60 text-slate-100 rounded-md p-2 font-mono text-xs focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                value={themeVariablesJson}
                onChange={e => setThemeVariablesJson(e.target.value)}
                placeholder='{"--my-var":"value"}'
              />
            </div>

            {/* Logos Branding */}
            <div className="border border-accent/10 rounded-xl p-4 bg-brand-900/30">
              <label className="block text-sm font-medium text-slate-300 mb-2">Logos Branding</label>
              <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-accent/10 file:text-accent hover:file:bg-accent/20"/>
              <div className="flex flex-wrap gap-3 mt-3">{logos.map((logo, idx) => (<div key={idx} className="relative group border border-accent/20 rounded-lg bg-brand-900/30 p-1"><img src={logo} alt="Logo" className="h-10 w-auto object-contain" /><button type="button" onClick={() => setLogos(logos.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-neon-pink text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-neon-pink/80 transition-colors">✕</button></div>))}</div>
            </div>
          </div>
          <div className="flex justify-end"><button type="submit" className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-bold shadow-glow btn-glow transition-colors">Mettre à jour</button></div>
        </form>
      </div>
      )}

      {/* System Tab */}
      {activeTab === 'system' && (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-200">Paramètres Système</h2>
        <form onSubmit={handleAppConfigSubmit} className="card-futuristic p-6 rounded-2xl shadow-card border border-accent/10 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-slate-300">Symbole Devise</label><input type="text" className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40" value={currency} onChange={e => setCurrency(e.target.value)} /></div>
            <div><label className="block text-sm font-medium text-slate-300">Décimales</label><input type="number" className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40" value={decimals} onChange={e => setDecimals(Number(e.target.value))} /></div>
            <div><label className="block text-sm font-medium text-slate-300">Délai sécurité validation (s)</label><input type="number" className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40" value={cooldown} onChange={e => setCooldown(Number(e.target.value))} /></div>
          </div>

          {/* Weather Location Selectors */}
          <div className="border-t border-accent/10 pt-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">Ville (Météo)</label>
            <p className="text-xs text-slate-500 mb-2">S'affiche si aucun logo n'est configuré.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500">Pays</label>
                <select 
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={selectedCountry}
                  onChange={(e) => {
                    setSelectedCountry(e.target.value);
                    if (e.target.value !== 'Autre') {
                      setSelectedCity(CITIES_BY_COUNTRY[e.target.value][0]);
                    }
                  }}
                >
                  {Object.keys(CITIES_BY_COUNTRY).map(country => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Ville</label>
                {selectedCountry === 'Autre' ? (
                  <input 
                    type="text" 
                    placeholder="Ville, Pays"
                    className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                  />
                ) : (
                  <select 
                    className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                  >
                    {CITIES_BY_COUNTRY[selectedCountry]?.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end"><button type="submit" className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-bold shadow-glow btn-glow transition-colors">Mettre à jour</button></div>
        </form>
      </div>
      )}

      {/* Company Tab */}
      {activeTab === 'company' && (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-200">Informations Société (Documents)</h2>
        <p className="text-slate-400 text-sm">Ces informations apparaîtront sur les documents téléchargés (factures, bons de livraison, etc.)</p>
        <form onSubmit={handleAppConfigSubmit} className="card-futuristic p-6 rounded-2xl shadow-card border border-accent/10 space-y-6">
          {/* Logo for Documents */}
          <div className="border border-accent/10 rounded-xl p-4 bg-brand-900/30">
            <label className="block text-sm font-medium text-slate-300 mb-2">Logo pour Documents</label>
            <p className="text-xs text-slate-500 mb-2">Peut être différent du logo de l'application</p>
            <input type="file" accept="image/*" onChange={handleDocumentLogoUpload} className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-accent/10 file:text-accent hover:file:bg-accent/20"/>
            {documentLogoUrl && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-accent/20 bg-brand-900/30 p-2">
                <img src={documentLogoUrl} alt="Document Logo" className="h-12 w-auto object-contain" />
                <button type="button" onClick={() => setDocumentLogoUrl(undefined)} className="text-xs text-neon-pink hover:text-neon-pink/80">Supprimer</button>
              </div>
            )}
            <div className="mt-2">
              <label className="block text-xs text-slate-500">Ou URL du logo</label>
              <input
                type="text"
                className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                value={documentLogoUrl || ''}
                onChange={e => setDocumentLogoUrl(e.target.value || undefined)}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Raison Sociale */}
          <div className="grid grid-cols-1 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-slate-300">Raison Sociale</label>
              <input
                type="text"
                className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                value={companyLegalName}
                onChange={e => setCompanyLegalName(e.target.value)}
                placeholder="Ex: SOCIÉTÉ XYZ SARL"
              />
            </div>
          </div>

          {/* Address */}
          <div className="grid grid-cols-1 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-slate-300">Adresse</label>
              <input
                type="text"
                className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                value={companyAddress}
                onChange={e => setCompanyAddress(e.target.value)}
                placeholder="Ex: 123 Rue Principale"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">Code Postal</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyPostalCode}
                  onChange={e => setCompanyPostalCode(e.target.value)}
                  placeholder="Ex: 1000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Ville</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyCity}
                  onChange={e => setCompanyCity(e.target.value)}
                  placeholder="Ex: Tunis"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Pays</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyCountry}
                  onChange={e => setCompanyCountry(e.target.value)}
                  placeholder="Ex: Tunisie"
                />
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">Téléphone</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyPhone}
                  onChange={e => setCompanyPhone(e.target.value)}
                  placeholder="Ex: +216 71 123 456"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Fax</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyFax}
                  onChange={e => setCompanyFax(e.target.value)}
                  placeholder="Ex: +216 71 123 457"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">Email</label>
                <input
                  type="email"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyEmail}
                  onChange={e => setCompanyEmail(e.target.value)}
                  placeholder="Ex: contact@societe.tn"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Site Web</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyWebsite}
                  onChange={e => setCompanyWebsite(e.target.value)}
                  placeholder="Ex: www.societe.tn"
                />
              </div>
            </div>

            {/* Legal Info */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">Matricule Fiscale</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyTaxId}
                  onChange={e => setCompanyTaxId(e.target.value)}
                  placeholder="Ex: 123456ABC000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Registre de Commerce</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyRegistration}
                  onChange={e => setCompanyRegistration(e.target.value)}
                  placeholder="Ex: B123456789"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">Capital Social</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyCapital}
                  onChange={e => setCompanyCapital(e.target.value)}
                  placeholder="Ex: 100 000 TND"
                />
              </div>
            </div>

            {/* Bank Info */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">Banque</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyBankName}
                  onChange={e => setCompanyBankName(e.target.value)}
                  placeholder="Ex: Banque de Tunisie"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">RIB</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                  value={companyBankRib}
                  onChange={e => setCompanyBankRib(e.target.value)}
                  placeholder="Ex: 01 234 5678901234567890 12"
                />
              </div>
            </div>

          {/* Footer Text */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-300">Texte de pied de page (documents)</label>
            <textarea
              className="mt-1 w-full min-h-[80px] border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
              value={documentFooterText}
              onChange={e => setDocumentFooterText(e.target.value)}
              placeholder="Ex: Merci pour votre confiance. Pour toute réclamation, veuillez nous contacter dans les 48 heures."
            />
          </div>

          <div className="flex justify-end"><button type="submit" className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-bold shadow-glow btn-glow transition-colors">Mettre à jour</button></div>
        </form>
      </div>
      )}

      {/* DMS Tab */}
      {activeTab === 'dms' && (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-200">Connexion SQL Server (DMS)</h2>
        <p className="text-slate-400 text-sm">Paramétrez la connexion au serveur de données principal.</p>

        <form onSubmit={handleSqlSubmit} className="card-futuristic p-6 rounded-2xl shadow-card border border-accent/10 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300">Hôte / IP</label>
              <input type="text" className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                value={config.host} onChange={e => setConfig({...config, host: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">Port</label>
              <input type="number" className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                value={config.port} onChange={e => setConfig({...config, port: Number(e.target.value)})} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Nom de la base de données</label>
            <input type="text" className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
              value={config.database} onChange={e => setConfig({...config, database: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300">Utilisateur SQL</label>
              <input type="text" className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                value={config.user} onChange={e => setConfig({...config, user: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Mot de passe
                {data?.hasPassword && !password && (
                  <span className="ml-2 text-xs text-neon-green font-normal">(configuré)</span>
                )}
              </label>
              <input type="password" className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                placeholder={data?.hasPassword ? "Laisser vide pour garder l'actuel" : "••••••••"}
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <input type="checkbox" id="encrypt" className="h-4 w-4 text-accent bg-brand-800/60 border-accent/30 rounded focus:ring-accent/40"
              checked={config.encrypted} onChange={e => setConfig({...config, encrypted: e.target.checked})} />
            <label htmlFor="encrypt" className="text-sm font-medium text-slate-300">Connexion Chiffrée (SSL)</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Intervalle de sync commandes (minutes)</label>
            <input type="number" className="mt-1 block w-full border border-accent/20 bg-brand-800/60 text-slate-100 placeholder-slate-500 rounded-md p-2 focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
              value={config.syncInterval} onChange={e => setConfig({...config, syncInterval: Number(e.target.value)})} />
          </div>

          {/* Catalog Load Mode */}
          <div className="border-t border-accent/10 pt-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">Mode de chargement du catalogue</label>
            <p className="text-xs text-slate-500 mb-3">Choisissez comment les produits s'affichent dans le catalogue.</p>
            <div className="flex gap-4">
              <label className={`flex-1 cursor-pointer border rounded-xl p-4 transition-all ${catalogLoadMode === 'auto' ? 'border-accent bg-accent/10 ring-2 ring-accent/30 shadow-inner-glow' : 'border-accent/10 bg-brand-800/40 hover:border-accent/30 hover:bg-brand-800/60'}`}>
                <input
                  type="radio"
                  name="catalogLoadMode"
                  value="auto"
                  checked={catalogLoadMode === 'auto'}
                  onChange={() => setCatalogLoadMode('auto')}
                  className="sr-only"
                />
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${catalogLoadMode === 'auto' ? 'bg-accent text-white border-accent/40' : 'bg-brand-900/40 text-slate-400 border-accent/10'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-slate-200">Automatique</div>
                    <div className="text-xs text-slate-400">Charge les produits au chargement de la page</div>
                  </div>
                </div>
              </label>
              <label className={`flex-1 cursor-pointer border rounded-xl p-4 transition-all ${catalogLoadMode === 'search' ? 'border-accent bg-accent/10 ring-2 ring-accent/30 shadow-inner-glow' : 'border-accent/10 bg-brand-800/40 hover:border-accent/30 hover:bg-brand-800/60'}`}>
                <input
                  type="radio"
                  name="catalogLoadMode"
                  value="search"
                  checked={catalogLoadMode === 'search'}
                  onChange={() => setCatalogLoadMode('search')}
                  className="sr-only"
                />
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${catalogLoadMode === 'search' ? 'bg-accent text-white border-accent/40' : 'bg-brand-900/40 text-slate-400 border-accent/10'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-slate-200">Sur recherche</div>
                    <div className="text-xs text-slate-400">Affiche les produits uniquement apres une recherche</div>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Connection Test Result */}
          {connectionTestResult && (
            <div className={`p-4 rounded-lg border ${connectionTestResult.success ? 'bg-neon-green/10 border-neon-green/30 text-neon-green' : 'bg-neon-pink/10 border-neon-pink/30 text-neon-pink'}`}>
              <div className="flex items-center gap-2">
                {connectionTestResult.success ? (
                  <svg className="w-5 h-5 text-neon-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-neon-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span className="font-medium">{connectionTestResult.message}</span>
                {connectionTestResult.latency && (
                  <span className="text-xs bg-neon-green/20 text-neon-green border border-neon-green/30 px-2 py-0.5 rounded-full ml-auto">
                    {connectionTestResult.latency}ms
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-accent/10 flex justify-between gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingConnection || !config.host || !config.database || !config.user}
              className="flex items-center gap-2 glass-light border border-accent/20 text-slate-200 px-4 py-2 rounded-lg font-medium hover:border-accent/40 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {testingConnection ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Test en cours...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Tester la connexion
                </>
              )}
            </button>
            <button type="submit" disabled={mutation.isPending} className="bg-accent text-white px-6 py-2 rounded-lg font-bold hover:bg-accent-hover shadow-glow btn-glow transition-all active:scale-95">
              {mutation.isPending ? 'Sauvegarde...' : 'Sauvegarder la connexion SQL'}
            </button>
          </div>
        </form>
      </div>
      )}

      {/* Mapping Tab */}
      {activeTab === 'mapping' && (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-200">Mappage des Tables DMS</h2>
        <p className="text-slate-400 text-sm">Configurez le mappage entre les colonnes de votre DMS et les champs de l'application.</p>

        <div className="card-futuristic p-6 rounded-2xl shadow-card border border-accent/10 space-y-6">
          {/* Mapping Type Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Type de données à mapper</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(Object.keys(MAPPING_TYPE_LABELS) as DmsMappingType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedMappingType(type);
                    setSelectedTable('');
                    setTableColumns([]);
                    setPreviewData([]);
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    selectedMappingType === type
                      ? 'bg-accent text-white border-accent/40 shadow-glow btn-glow'
                      : 'bg-brand-800/60 text-slate-200 border-accent/10 hover:border-accent/30 hover:bg-brand-800/80'
                  }`}
                >
                  {MAPPING_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Table Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Table DMS source</label>
            {loadingTables ? (
              <div className="flex items-center text-slate-400">
                <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Chargement des tables...
              </div>
            ) : dmsTables.length === 0 ? (
              <div className="text-neon-orange bg-neon-orange/10 border border-neon-orange/30 p-3 rounded-lg text-sm">
                Aucune table disponible. Vérifiez votre connexion SQL Server.
              </div>
            ) : (
              <select
                className="w-full border border-accent/20 bg-brand-800/60 text-slate-100 rounded-lg p-2 focus:ring-2 focus:ring-accent/30 focus:border-accent/40"
                value={selectedTable}
                onChange={e => {
                  setSelectedTable(e.target.value);
                  setPreviewData([]);
                }}
              >
                <option value="">-- Sélectionner une table --</option>
                {dmsTables.map(table => (
                  <option key={table} value={table}>{table}</option>
                ))}
              </select>
            )}
          </div>

          {/* Column Mappings */}
          {selectedTable && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Mappage des colonnes</label>
              {loadingColumns ? (
                <div className="flex items-center text-slate-400">
                  <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Chargement des colonnes...
                </div>
              ) : tableColumns.length === 0 ? (
                <div className="text-neon-orange bg-neon-orange/10 border border-neon-orange/30 p-3 rounded-lg text-sm">
                  Aucune colonne trouvée pour cette table.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {availableFields.map(field => (
                    <div key={field} className="flex items-center gap-2 bg-brand-800/40 border border-accent/10 p-3 rounded-lg">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          {MAPPING_LABELS[selectedMappingType][field]}
                        </label>
                        <select
                          className="w-full border border-accent/20 bg-brand-900/40 text-slate-100 rounded p-2 text-sm focus:ring-1 focus:ring-accent/30 focus:border-accent/40"
                          value={columnMappings[field] || ''}
                          onChange={e => setColumnMappings(prev => ({ ...prev, [field]: e.target.value }))}
                        >
                          <option value="">-- Non mappé --</option>
                          {tableColumns.map(col => (
                            <option key={col.name} value={col.name}>
                              {col.name} ({col.dataType}{col.maxLength ? `(${col.maxLength})` : ''})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview Section */}
          {selectedTable && Object.keys(columnMappings).some(k => columnMappings[k]) && (
            <div className="border-t border-accent/10 pt-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-medium text-slate-300">Aperçu des données</label>
                <button
                  type="button"
                  onClick={loadPreviewData}
                  disabled={loadingPreview}
                  className="flex items-center gap-2 text-sm glass-light border border-accent/20 text-slate-200 px-3 py-1.5 rounded-lg hover:border-accent/40 hover:text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  {loadingPreview ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Chargement...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Prévisualiser
                    </>
                  )}
                </button>
              </div>

              {previewData.length > 0 && (
                <div className="overflow-x-auto border border-accent/10 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-brand-900/60">
                      <tr>
                        {Object.keys(previewData[0]).map(key => (
                          <th key={key} className="px-3 py-2 text-left font-medium text-slate-300">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-accent/10">
                      {previewData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-brand-800/30">
                          {Object.values(row).map((val: any, i) => (
                            <td key={i} className="px-3 py-2 text-slate-200 truncate max-w-[150px]" title={String(val ?? '')}>
                              {val !== null && val !== undefined ? String(val) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-between items-center pt-4 border-t">
            {existingMapping && !existingMapping.isDefault && (
              <span className="text-xs text-green-600 flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Mapping personnalisé actif
              </span>
            )}
            {existingMapping?.isDefault && (
              <span className="text-xs text-slate-500">Utilise le mapping par défaut</span>
            )}
            <button
              type="button"
              onClick={saveMapping}
              disabled={savingMapping || !selectedTable}
              className="flex items-center gap-2 bg-accent text-white px-6 py-2 rounded-lg font-bold hover:bg-accent-hover shadow-glow btn-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {savingMapping ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sauvegarde...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Sauvegarder le mapping
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      )}

      <ConfirmModal
        isOpen={showConfigConfirm}
        onClose={() => setShowConfigConfirm(false)}
        onConfirm={confirmAppConfigSubmit}
        title="Mettre à jour la configuration ?"
        message="Cela changera les règles d'affichage et de sécurité pour tous les utilisateurs."
        confirmLabel="Mettre à jour"
      />

      <ConfirmModal
        isOpen={showSqlConfirm}
        onClose={() => setShowSqlConfirm(false)}
        onConfirm={confirmSqlSubmit}
        title="Sauvegarder la connexion SQL ?"
        message="Une mauvaise configuration peut interrompre la synchronisation avec le DMS. Assurez-vous des paramètres."
        confirmLabel="Sauvegarder"
        isDestructive={true}
      />
    </div>
  );
};
