import {
  AlertTriangle, BarChart3, Bell, Car, ClipboardList, Coins, FileCheck2, FileSearch, FileText, Gauge, History, Landmark,
  LayoutDashboard, type LucideIcon, Package, Receipt, ScanSearch, ShieldCheck, ShieldQuestion, Tag, Truck, Users, Warehouse, Wrench, KeyRound, Timer,
} from 'lucide-react';

/** Client-side presentation of catalog modules: label, icon and where each one lives. */
export interface ModuleMeta { label: string; icon: LucideIcon; path: string }

export const MODULE_META: Record<string, ModuleMeta> = {
  dashboard: { label: 'Dashboard', icon: LayoutDashboard, path: '/app' },
  garage: { label: 'Garage', icon: Warehouse, path: '/garage' },
  vehicles: { label: 'Vehicles', icon: Car, path: '/app/m/vehicles' },
  inventory: { label: 'Inventory', icon: Tag, path: '/app/m/inventory' },
  customers: { label: 'Customers', icon: Users, path: '/app/m/customers' },
  resale_readiness: { label: 'Resale', icon: Coins, path: '/app/m/resale_readiness' },
  data_room: { label: 'Data Rooms', icon: KeyRound, path: '/app/m/vehicles' },
  vehicle_confidence: { label: 'Vehicle Confidence', icon: ShieldCheck, path: '/app/m/vehicles' },
  vehicle_passport: { label: 'Vehicle Passport', icon: FileCheck2, path: '/app/m/vehicles' },
  service_history: { label: 'Service History', icon: History, path: '/app/m/vehicles' },
  documents: { label: 'Documents', icon: FileText, path: '/app/m/vehicles' },
  assistant: { label: 'Assistant', icon: ScanSearch, path: '/app/m/vehicles' },
  maintenance_intel: { label: 'Maintenance', icon: Wrench, path: '/app/m/maintenance_intel' },
  analytics: { label: 'Analytics', icon: BarChart3, path: '/app/m/analytics' },
  vehicle_history: { label: 'Vehicle History', icon: History, path: '/app/m/vehicle_history' },
  claims_evidence: { label: 'Claims Evidence', icon: ShieldQuestion, path: '/app/m/claims_evidence' },
  risk_signals: { label: 'Risk Signals', icon: AlertTriangle, path: '/app/m/risk_signals' },
  inspection: { label: 'Inspection', icon: ClipboardList, path: '/app/m/inspection' },
  ownership: { label: 'Ownership', icon: KeyRound, path: '/app/m/ownership' },
  valuation: { label: 'Valuation', icon: Coins, path: '/app/m/valuation' },
  collateral: { label: 'Collateral', icon: Landmark, path: '/app/m/collateral' },
  parts_history: { label: 'Parts History', icon: Package, path: '/app/m/parts_history' },
  inspection_queue: { label: 'Inspection Queue', icon: FileSearch, path: '/app/m/inspection_queue' },
  inspection_reports: { label: 'Inspection Reports', icon: ClipboardList, path: '/app/m/inspection_reports' },
  fleet: { label: 'Fleet', icon: Truck, path: '/app/m/fleet' },
  service_costs: { label: 'Service Costs', icon: Receipt, path: '/app/m/service_costs' },
  alerts: { label: 'Alerts', icon: Bell, path: '/app/m/alerts' },
  utilization: { label: 'Utilization', icon: Timer, path: '/app/m/utilization' },
};

export const moduleMeta = (id: string): ModuleMeta => MODULE_META[id] ?? { label: id, icon: Gauge, path: `/app/m/${id}` };

export const CATEGORY_LABEL: Record<string, string> = {
  dealership: 'Dealership', insurance: 'Insurance', finance: 'Auto finance', service: 'Service centre',
  inspection: 'Inspection', fleet: 'Fleet', consumer: 'Owner', full: 'Full platform',
};

export const ROLE_LABEL: Record<string, string> = {
  platform_admin: 'CarVault Admin', tenant_admin: 'Organization admin', tenant_user: 'Team member',
};
