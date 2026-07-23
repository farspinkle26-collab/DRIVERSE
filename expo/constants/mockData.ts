import { Driver, User } from "@/types";

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