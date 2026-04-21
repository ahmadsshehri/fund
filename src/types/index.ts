// ==================== ENUMS ====================

export type UserRole = 'manager' | 'admin' | 'investor';
export type UserStatus = 'active' | 'inactive';

export type InvestorStatus = 'active' | 'inactive' | 'exited';

export type InvestmentType =
  | 'closed_return'      // مغلق بعائد نهائي
  | 'periodic_dividend'  // يوزع أرباحًا دورية
  | 'accumulative'       // تراكمي
  | 'distressed'         // متعثر
  | 'frozen';            // مجمد

export type InvestmentStatus = 'active' | 'closed' | 'distressed' | 'frozen';

export type DistressStatus =
  | 'under_follow_up'    // تحت المتابعة
  | 'legal_case'         // قضية قانونية
  | 'settlement'         // تسوية
  | 'written_off';       // شطب

export type ExpenseType =
  | 'zakat'
  | 'bank_fees'
  | 'admin'
  | 'legal'
  | 'other';

export type PaymentMethod = 'bank_transfer' | 'cash' | 'check' | 'other';

export type ExpenseStatus = 'pending' | 'approved' | 'cancelled';

export type DistributionType =
  | 'profit_distribution'     // توزيع أرباح
  | 'reinvestment'           // إعادة استثمار
  | 'new_investor'           // دخول مستثمر جديد
  | 'capital_increase'       // زيادة رأس المال
  | 'capital_decrease'       // تخفيض رأس المال
  | 'investor_exit'          // خروج مستثمر
  | 'increase_contribution'  // زيادة مساهمة
  | 'decrease_contribution'  // تخفيض مساهمة
  | 'restructure'            // إعادة هيكلة
  | 'share_price_adjustment';// تعديل سعر الحصة

export type CashFlowType =
  | 'capital_in'
  | 'profit_received'
  | 'investment_return'
  | 'investment_out'
  | 'expense_out'
  | 'distribution_out'
  | 'redemption_out'
  | 'cash_adjustment';

// ==================== USER ====================

export interface UserPermissions {
  manageInvestors: boolean;
  manageInvestments: boolean;
  manageExpenses: boolean;
  manageDistributions: boolean;
  viewReports: boolean;
  exportReports: boolean;
  manageUsers: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  investorId?: string; // linked investor
  permissions?: UserPermissions; // for admin role
  lastLogin?: Date;
  createdAt: Date;
  createdBy: string;
}

// ==================== INVESTOR ====================

export interface Investor {
  id: string;
  investorNumber: string;
  name: string;
  email: string;
  identityNumber?: string;
  joinDate: Date;
  investedAmount: number;    // original investment
  additionalAmount: number;  // all subsequent additions
  totalPaid: number;         // investedAmount + additionalAmount
  shareCount: number;
  sharePrice: number;        // at entry
  ownershipPercentage: number;
  status: InvestorStatus;
  userId?: string;           // linked user account
  notes?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
}

// ==================== INVESTOR HISTORY ====================

export interface InvestorHistory {
  id: string;
  investorId: string;
  type: DistributionType;
  date: Date;
  amount: number;
  sharesBefore: number;
  sharesAfter: number;
  ownershipBefore: number;
  ownershipAfter: number;
  affectsCash: boolean;
  notes?: string;
  createdBy: string;
  createdAt: Date;
}

// ==================== INVESTMENT ====================

export interface InvestmentDividend {
  id: string;
  investmentId: string;
  date: Date;
  received: number;
  accrued: number;
  cumulative: number;
  lastUpdated: Date;
  notes?: string;
  createdBy: string;
}

export interface DistressInfo {
  date: Date;
  reason: string;
  estimatedLossPercentage: number;
  expectedRecoveryAmount: number;
  status: DistressStatus;
  notes?: string;
}

export interface Investment {
  id: string;
  investmentNumber: string;
  name: string;
  type: InvestmentType;
  entity: string; // الجهة أو الأصل
  entryDate: Date;
  entryAmount: number;
  status: InvestmentStatus;
  closingDate?: Date;
  closingAmount?: number;
  totalProfit?: number;
  annualReturn?: number;
  durationDays?: number;
  // for periodic/accumulative
  receivedProfits?: number;
  accruedProfits?: number;
  cumulativeProfits?: number;
  lastProfitUpdate?: Date;
  distributionPeriod?: string; // monthly, quarterly, annual
  // for distressed
  distressInfo?: DistressInfo;
  notes?: string;
  attachments?: string[]; // URLs
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
}

// ==================== EXPENSE ====================

export interface Expense {
  id: string;
  expenseNumber: string;
  type: ExpenseType;
  description: string;
  date: Date;
  amount: number;
  paymentMethod: PaymentMethod;
  investmentId?: string;
  investmentName?: string;
  status: ExpenseStatus;
  approvedBy?: string;
  approvedAt?: Date;
  notes?: string;
  attachments?: string[];
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
}

// ==================== DISTRIBUTION ====================

export interface DistributionDetail {
  investorId: string;
  investorName: string;
  ownershipPercentage: number;
  amount: number;
  sharesBefore: number;
  sharesAfter: number;
}

export interface Distribution {
  id: string;
  distributionNumber: string;
  type: DistributionType;
  date: Date;
  totalAmount: number;
  investorId?: string; // if single investor
  investorName?: string;
  sharesBefore?: number;
  sharesAfter?: number;
  ownershipBefore?: number;
  ownershipAfter?: number;
  affectsCash: boolean;
  details?: DistributionDetail[];
  status: 'pending' | 'approved';
  approvedBy?: string;
  approvedAt?: Date;
  notes?: string;
  createdAt: Date;
  createdBy: string;
}

// ==================== CASH FLOW ====================

export interface CashFlow {
  id: string;
  type: CashFlowType;
  date: Date;
  amount: number; // positive = in, negative = out
  referenceId?: string; // investment/expense/distribution id
  referenceType?: string;
  description: string;
  createdBy: string;
  createdAt: Date;
}

// ==================== FUND SNAPSHOT ====================

export interface FundSnapshot {
  id: string;
  date: Date;
  totalShares: number;
  sharePrice: number;
  navFund: number;
  totalCapital: number;
  availableCash: number;
  totalInvestors: number;
  notes?: string;
  createdBy: string;
  createdAt: Date;
}

// ==================== ACTIVITY LOG ====================

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string; // 'create' | 'update' | 'delete' | 'approve' | 'login'
  entity: string; // 'investor' | 'investment' | 'expense' | 'distribution'
  entityId?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

// ==================== DASHBOARD STATS ====================

export interface DashboardStats {
  availableCash: number;
  frozenCash: number;
  expectedCashIn: number;
  expectedCashOut: number;
  totalCapital: number;
  totalInvestors: number;
  totalShares: number;
  currentSharePrice: number;
  activeInvestments: number;
  closedInvestments: number;
  distressedInvestments: number;
  realizedProfits: number;
  unrealizedProfits: number;
  totalExpenses: number;
  totalDistributions: number;
  alerts: Alert[];
}

export interface Alert {
  type: 'warning' | 'info' | 'danger';
  message: string;
  entityId?: string;
  entityType?: string;
}
