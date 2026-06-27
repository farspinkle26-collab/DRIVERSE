import { Driver, TowRequest, User } from "@/types";

// Towing types with icons and detailed descriptions for display
export const towingTypes = [
  { 
    id: '1', 
    name: 'Hidraulik', 
    price: 'Mulai Rp 800.000', 
    description: 'Derek dengan sistem hidraulik',
    detailedDescription: 'Jenis derek dengan sistem angkat hidraulik penuh yang mampu mengangkat kendaraan secara menyeluruh dengan minim guncangan.\n\n✔️ Sangat direkomendasikan untuk mobil sport, kendaraan premium, atau mobil mewah yang membutuhkan penanganan ekstra hati-hati agar terhindar dari kerusakan tambahan.',
    icon: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/oqrc353owigm3wdw2sidc'
  },
  { 
    id: '2', 
    name: 'Tangga', 
    price: 'Mulai Rp 595.000', 
    description: 'Derek dengan tanduk di belakang',
    detailedDescription: 'Derek dengan bak rata menyerupai tangga datar untuk menaikkan kendaraan secara utuh.\n\n✔️ Cocok untuk kendaraan baru, mobil sport, mobil listrik, dan mobil mewah karena memberikan keamanan maksimal saat pengangkutan.',
    icon: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/euxrzihfxwpu5hvbyqwyz'
  },
  { 
    id: '3', 
    name: 'Katrol', 
    price: 'Mulai Rp 1.200.000', 
    description: 'Derek dengan sistem katrol di belakang',
    detailedDescription: 'Menggunakan katrol atau winch untuk menarik kendaraan ke atas bak derek.\n\n✔️ Ideal untuk kendaraan mogok di lokasi sulit, seperti terperosok ke parit, jalan menanjak, atau kondisi medan tidak rata.',
    icon: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/kk43lipetbj531thw9rwf'
  },
  { 
    id: '4', 
    name: 'Service Car', 
    price: 'Rp 350.000', 
    description: 'Layanan perbaikan di tempat',
    detailedDescription: 'Kendaraan khusus untuk memberikan perbaikan ringan di lokasi tanpa perlu menderek.\n\n✔️ Cocok untuk kondisi darurat ringan seperti aki habis, ban kempis, atau kunci tertinggal di dalam mobil.',
    icon: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/6scvkd3h758rc0cclzosw'
  },
  { 
    id: '5', 
    name: 'Sepatu Roda/Dolly', 
    price: 'Mulai Rp 2.000.000', 
    description: 'Derek dengan sepatu roda di belakang',
    detailedDescription: 'Menggunakan alat tambahan berupa roller kecil yang ditempatkan pada ban bermasalah.\n\n✔️ Sesuai untuk kendaraan dengan salah satu roda macet atau rusak, sehingga tetap dapat diderek tanpa mengangkat seluruh bagian mobil.\n\nUntuk Dolly: Menggunakan roda tambahan (dolly wheels) untuk mengangkat kendaraan dengan stabil.\n\n✔️ Cocok digunakan untuk mobil transmisi otomatis atau kendaraan dengan kerusakan parah, yang tidak aman bila roda menyentuh jalan.',
    icon: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/h0ce8m7slo07yxzuird6s'
  },
  { 
    id: '6', 
    name: 'Free Wheel', 
    price: 'Rp 600.000', 
    description: 'Alat bantu netral matic/lock sistem (hanya ban)',
    detailedDescription: 'Derek dengan sistem pengangkatan sebagian roda, biasanya bagian depan atau belakang.\n\n✔️ Efektif untuk kendaraan standar yang mogok di jalan datar, namun kurang direkomendasikan untuk mobil transmisi otomatis atau mobil premium karena berisiko menimbulkan kerusakan.',
    icon: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/taydsbo8bdrmoxfa019sj'
  },
  { 
    id: '7', 
    name: 'Double Deck', 
    price: 'Mulai Rp 4.000.000', 
    description: 'Derek untuk multiple kendaraan',
    detailedDescription: 'Truk derek dengan dua tingkat (double deck carrier) yang mampu mengangkut lebih dari satu kendaraan sekaligus.\n\n✔️ Umumnya digunakan oleh dealer, ATPM, perusahaan logistik, atau distribusi kendaraan baru dari pabrik ke showroom.',
    icon: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/kqg3ljhdhoxhlo2gqmj05'
  },
  { 
    id: '8', 
    name: 'Moge', 
    price: 'Mulai Rp 500.000', 
    description: 'Derek khusus untuk motor besar',
    detailedDescription: 'Derek khusus untuk motor besar (moge) yang dilengkapi dengan sistem pengikat dan penyangga aman.\n\n✔️ Diperuntukkan bagi motor sport, cruiser, dan motor premium yang tidak bisa ditarik dengan metode standar.',
    icon: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/xw148aq9qcoxnp27hd5a8'
  },
  { 
    id: '9', 
    name: 'Derek Basement', 
    price: 'Rp 1.000.000', 
    description: 'Derek untuk area basement/parkir',
    detailedDescription: 'Didesain dengan ukuran lebih kecil dan ramp fleksibel agar dapat masuk ke area rendah.\n\n✔️ Ideal untuk parkiran basement gedung perkantoran, mall, atau apartemen yang memiliki akses terbatas bagi derek berukuran besar.',
    icon: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/bf5yp90ycbjlrt3cejdg1'
  },
  { 
    id: '10', 
    name: 'Selfloader', 
    price: 'Mulai Rp 2.500.000', 
    description: 'Derek dengan sistem self-loading',
    detailedDescription: 'Derek yang mampu menaikkan kendaraan secara otomatis dengan bantuan hidraulik atau katrol tanpa memerlukan alat tambahan.\n\n✔️ Sangat berguna di jalan sempit atau area parkir terbatas karena lebih cepat dan praktis.',
    icon: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/ff4aj351rgjs21if6cyet'
  }
];

// Service pricing configuration
export const SERVICE_TYPES = {
  hydraulic: {
    id: 'hydraulic',
    name: 'Towing Hidraulik',
    baseFare: 800000, // 800,000 IDR for first 10km
    pricePerKm: 20000, // 20,000 IDR per km after 10km
    baseDistance: 10,
    isFixed: false
  },
  ladder: {
    id: 'ladder', 
    name: 'Towing Tangga',
    baseFare: 595000, // 595,000 IDR for first 10km (dalam kota)
    pricePerKm: 15000, // 15,000 IDR per km after 10km (maksimal 160km)
    longDistanceRate: 7000, // 7,000 IDR per km for distances over 160km (luar kota)
    baseDistance: 10,
    longDistanceThreshold: 160, // Changed from 200km to 160km
    maxInCityDistance: 160, // Maximum distance for in-city pricing
    isFixed: false,
    specialPricing: {
      'jateng': { min: 2500000, max: 4000000 },
      'jatim': { min: 3500000, max: 6000000 },
      'bali': { min: 8000000, max: 10000000 },
      'lampung': 6000000,
      'palembang': 12000000,
      'medan': 18000000,
      'aceh': 25000000
    }
  },
  accident: {
    id: 'accident',
    name: 'Derek Evakuasi Kecelakaan', 
    baseFare: 1200000, // 1,200,000 IDR for first 10km
    pricePerKm: 50000, // 50,000 IDR per km after 10km
    baseDistance: 10,
    isFixed: false
  },
  service: {
    id: 'service',
    name: 'Service Car',
    baseFare: 350000, // Fixed 350,000 IDR within 8km
    pricePerKm: 0, // No additional charge
    baseDistance: 8,
    maxDistance: 8,
    isFixed: true
  },
  roller_tire: {
    id: 'roller_tire',
    name: 'Derek Sepatu Roda (Roller Tire)',
    baseFare: 2000000, // 2,000,000 IDR for first 10km
    pricePerKm: 30000, // 30,000 IDR per km after 10km
    baseDistance: 10,
    isFixed: false
  },
  free_wheel: {
    id: 'free_wheel',
    name: 'Free Wheel (alat bantu netral matic/lock sistem)',
    baseFare: 600000, // Fixed 600,000 IDR max per case (DKI only)
    pricePerKm: 0, // No additional charge
    baseDistance: 0,
    isFixed: true,
    dkiOnly: true
  },
  selfloader: {
    id: 'selfloader',
    name: 'Selfloader (angkutan alat berat)',
    baseFare: 2500000, // 2,500,000 IDR for first 10km
    pricePerKm: 50000, // 50,000 IDR per km after 10km
    baseDistance: 10,
    isFixed: false
  },
  dolly: {
    id: 'dolly',
    name: 'Dolly (angkutan alat berat big size low ground clearance)',
    baseFare: 5000000, // 5,000,000 IDR for first 10km
    pricePerKm: 100000, // 100,000 IDR per km after 10km
    baseDistance: 10,
    isFixed: false
  },
  double_deck: {
    id: 'double_deck',
    name: 'Double Deck Mobil',
    baseFare: 0, // Special pricing based on routes
    pricePerKm: 0,
    baseDistance: 0,
    isFixed: true,
    specialPricing: {
      'jakarta_surabaya': 4000000,
      'jakarta_medan': 8000000,
      'jakarta_aceh': 15000000,
      'event_special': 14000000 // PP (round trip)
    }
  },
  moge_transport: {
    id: 'moge_transport',
    name: 'Angkutan Motor Besar (Moge)',
    baseFare: 500000, // 500,000 IDR for first 10km
    pricePerKm: 8000, // 8,000 IDR per km after 10km
    baseDistance: 10,
    isFixed: false
  },
  basement_towing: {
    id: 'basement_towing',
    name: 'Derek Basement',
    baseFare: 1000000, // Fixed 1,000,000 IDR per case
    pricePerKm: 0, // No additional charge
    baseDistance: 0,
    isFixed: true
  }
} as const;

// Legacy constants for backward compatibility
export const BASE_FARE = SERVICE_TYPES.ladder.baseFare;
export const PRICE_PER_KM = SERVICE_TYPES.ladder.pricePerKm;

export const mockUsers: User[] = [
  {
    id: "user1",
    name: "Budi Santoso",
    email: "budi@example.com",
    phone: "+62812345678",
    role: "customer",
    profilePicture: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop",
    accountStatus: "active",
    verificationStatus: "verified",
    canSwitchRoles: false,
  },
  {
    id: "user2",
    name: "Dewi Putri",
    email: "dewi@example.com",
    phone: "+62812345679",
    role: "customer",
    profilePicture: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop",
    accountStatus: "active",
    verificationStatus: "verified",
    canSwitchRoles: false,
  },
  {
    id: "driver1",
    name: "Agus Wijaya",
    email: "agus@example.com",
    phone: "+62812345680",
    role: "driver",
    profilePicture: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop",
    accountStatus: "active",
    verificationStatus: "verified",
    canSwitchRoles: false,
  },
  {
    id: "driver2",
    name: "Rini Susanti",
    email: "rini@example.com",
    phone: "+62812345681",
    role: "driver",
    profilePicture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop",
    accountStatus: "active",
    verificationStatus: "verified",
    canSwitchRoles: false,
  },
];

export const mockDrivers: Driver[] = [
  {
    id: "driver1",
    userId: "driver1",
    name: "Agus Wijaya",
    phone: "+62812345680",
    vehicleType: "Flatbed Tow Truck",
    licensePlate: "B 1234 KLM",
    rating: 4.8,
    profilePicture: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop",
    location: {
      latitude: -6.1751,
      longitude: 106.8650,
      address: "Jl. Sudirman, Jakarta",
    },
    isAvailable: true,
    verificationStatus: 'verified',
    isCompanyDriver: false,
  },
  {
    id: "driver2",
    userId: "driver2",
    name: "Rini Susanti",
    phone: "+62812345681",
    vehicleType: "Wheel-Lift Tow Truck",
    licensePlate: "B 5678 XYZ",
    rating: 4.7,
    profilePicture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop",
    location: {
      latitude: -6.2088,
      longitude: 106.8456,
      address: "Jl. Gatot Subroto, Jakarta",
    },
    isAvailable: true,
    verificationStatus: 'verified',
    isCompanyDriver: false,
  },
];

export const mockTowRequests: TowRequest[] = [
  {
    id: "request1",
    customerId: "user1",
    driverId: "driver1",
    pickup: {
      latitude: -6.1751,
      longitude: 106.8650,
      address: "Jl. Sudirman No. 123, Jakarta",
    },
    dropoff: {
      latitude: -6.2088,
      longitude: 106.8456,
      address: "Jl. Gatot Subroto No. 456, Jakarta",
    },
    status: "completed",
    distance: 5.2,
    vehicleInfo: {
      make: "Toyota",
      model: "Avanza",
      color: "Silver",
      licensePlate: "B 1234 ABC",
      photos: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?q=80&w=400&auto=format&fit=crop"],
    },
    breakdownInfo: {
      type: "engine_wont_start",
      notes: "Engine suddenly stopped working",
    },
    price: BASE_FARE + (Math.ceil(5.2) * PRICE_PER_KM),
    createdAt: Date.now() - 86400000, // 1 day ago
    completedAt: Date.now() - 82800000, // 23 hours ago
  },
  {
    id: "request2",
    customerId: "user2",
    driverId: "driver2",
    pickup: {
      latitude: -6.2297,
      longitude: 106.8251,
      address: "Jl. Kemang Raya No. 789, Jakarta",
    },
    dropoff: {
      latitude: -6.1751,
      longitude: 106.8650,
      address: "Jl. Sudirman No. 123, Jakarta",
    },
    status: "completed",
    distance: 7.8,
    vehicleInfo: {
      make: "Honda",
      model: "Jazz",
      color: "White",
      licensePlate: "B 5678 DEF",
      photos: ["https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=400&auto=format&fit=crop"],
    },
    breakdownInfo: {
      type: "flat_tire",
      notes: "Front left tire is flat",
    },
    price: BASE_FARE + (Math.ceil(7.8) * PRICE_PER_KM),
    createdAt: Date.now() - 172800000, // 2 days ago
    completedAt: Date.now() - 169200000, // 47 hours ago
  },
];

// Jakarta landmarks for demo
export const jakartaLandmarks = [
  {
    name: "Grand Indonesia",
    latitude: -6.1950,
    longitude: 106.8219,
    address: "Grand Indonesia, Jakarta Pusat",
  },
  {
    name: "Ancol",
    latitude: -6.1271,
    longitude: 106.8317,
    address: "Ancol, Jakarta Utara",
  },
  {
    name: "Senayan City",
    latitude: -6.2275,
    longitude: 106.7975,
    address: "Senayan City, Jakarta Selatan",
  },
  {
    name: "Kota Tua",
    latitude: -6.1376,
    longitude: 106.8133,
    address: "Kota Tua, Jakarta Barat",
  },
  {
    name: "Monas",
    latitude: -6.1754,
    longitude: 106.8272,
    address: "Monas, Jakarta Pusat",
  },
];