// ============================================================================
// WorkStream backend entity types (mirrors DDD.txt models)
// ============================================================================

export type UUID = string;
export type ISODate = string;

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'OPS' | 'FINANCE' | 'SUPPORT' | 'BUSINESS' | 'AGENT';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'DEACTIVATED';

export interface User {
  id: UUID;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified?: boolean;
  lastLoginAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type BusinessStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';

export interface Business {
  id: UUID;
  name: string;
  legalName?: string;
  email: string;
  phone?: string;
  country?: string;
  industry?: string;
  status: BusinessStatus;
  verifiedAt?: ISODate;
  ownerId: UUID;
  taskCount?: number;
  agentCount?: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type AgentStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'ACTIVE' | 'SUSPENDED' | 'OFFLINE' | 'ONLINE';
export type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Agent {
  id: UUID;
  userId: UUID;
  fullName: string;
  email: string;
  phone?: string;
  country?: string;
  skills?: string[];
  rating?: number;
  tasksCompleted?: number;
  completedTasks?: number;
  status: AgentStatus;
  kycStatus: KycStatus;
  onlineNow?: boolean;
  lastSeenAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type TaskStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface Task {
  id: UUID;
  title: string;
  businessId: UUID;
  businessName?: string;
  assignedAgentId?: UUID;
  assignedAgentName?: string;
  status: TaskStatus;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  budget?: number;
  currency?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  dueAt?: ISODate;
}

export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type PaymentType = 'DEPOSIT' | 'ESCROW' | 'RELEASE' | 'PAYOUT' | 'FEE' | 'REFUND';

export interface Payment {
  id: UUID;
  type: PaymentType;
  status: PaymentStatus;
  amount: number;
  currency: string;
  fee?: number;
  userId?: UUID;
  businessId?: UUID;
  agentId?: UUID;
  taskId?: UUID;
  method?: string;
  reference?: string;
  createdAt: ISODate;
  completedAt?: ISODate;
}

export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface Payout {
  id: UUID;
  agentId: UUID;
  agentName?: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  method: string;
  reference?: string;
  createdAt: ISODate;
  processedAt?: ISODate;
}

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';

export interface Dispute {
  id: UUID;
  taskId: UUID;
  taskTitle?: string;
  openedByUserId: UUID;
  openedByName?: string;
  againstUserId?: UUID;
  reason: string;
  status: DisputeStatus;
  resolutionNote?: string;
  createdAt: ISODate;
  resolvedAt?: ISODate;
}

export interface AuditLog {
  id: UUID;
  actorId?: UUID;
  actorEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: ISODate;
}

export interface SystemFlag {
  key: string;
  label: string;
  description?: string;
  enabled: boolean;
  updatedAt?: ISODate;
}

export interface SystemConfig {
  flags: SystemFlag[];
  pricing?: {
    platformFeePct: number;
    minPayoutAmount: number;
    payoutCurrencies: string[];
  };
}

// Generic list envelope
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ----------------------------------------------------------------------------
// Support / Ticketing
// ----------------------------------------------------------------------------
export type TicketStatus = 'OPEN' | 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TicketMessage {
  id: UUID;
  ticketId: UUID;
  authorId: UUID;
  authorName?: string;
  authorRole?: 'USER' | 'AGENT' | 'BUSINESS' | 'ADMIN' | 'SUPPORT';
  body: string;
  internal?: boolean;
  createdAt: ISODate;
}

export interface Ticket {
  id: UUID;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category?: string;
  requesterId: UUID;
  requesterName?: string;
  requesterEmail?: string;
  assigneeId?: UUID;
  assigneeName?: string;
  lastMessageAt?: ISODate;
  messageCount?: number;
  slaBreached?: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
  messages?: TicketMessage[];
}

export interface CannedResponse {
  id: UUID;
  title: string;
  body: string;
  tags?: string[];
}

// ----------------------------------------------------------------------------
// Moderation
// ----------------------------------------------------------------------------
export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED';
export type ModerationContentType = 'MESSAGE' | 'PROFILE' | 'TASK_DESCRIPTION' | 'REVIEW' | 'ATTACHMENT';

export interface ModerationItem {
  id: UUID;
  contentType: ModerationContentType;
  contentPreview: string;
  authorId: UUID;
  authorName?: string;
  reason: string;
  aiScore?: number;
  flagCount?: number;
  status: ModerationStatus;
  createdAt: ISODate;
  reviewedAt?: ISODate;
  reviewerId?: UUID;
}

// ----------------------------------------------------------------------------
// RBAC
// ----------------------------------------------------------------------------
export interface Permission {
  key: string;
  label: string;
  group: string;
  description?: string;
}

export interface Role {
  id: UUID;
  name: string;
  description?: string;
  builtIn?: boolean;
  userCount?: number;
  permissions: string[];
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

// ----------------------------------------------------------------------------
// Analytics (deeper than overview)
// ----------------------------------------------------------------------------
export interface AnalyticsBundle {
  revenueSeries: { date: string; revenue: number; gmv: number; fees: number }[];
  cohortRetention: { cohort: string; size: number; w1: number; w2: number; w4: number; w8: number }[];
  funnel: { step: string; users: number }[];
  geoBreakdown: { country: string; users: number; gmv: number }[];
  topBusinesses: { id: string; name: string; gmv: number; tasks: number }[];
  topAgents: { id: string; name: string; earnings: number; tasks: number; rating: number }[];
}

// Overview / KPI
export interface PlatformStats {
  totalUsers: number;
  totalBusinesses: number;
  totalAgents: number;
  activeTasks: number;
  completedTasks: number;
  openDisputes: number;
  pendingKyc: number;
  gmv: number;
  revenue: number;
  revenueSeries?: { date: string; revenue: number; gmv: number }[];
}
