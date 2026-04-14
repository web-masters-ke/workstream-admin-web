// Fallback mock data. Returned by page loaders when the backend call errors
// so the UI remains browsable in local dev before the backend is wired up.

import type {
  Agent,
  AnalyticsBundle,
  AuditLog,
  Business,
  CannedResponse,
  Dispute,
  ModerationItem,
  Payment,
  Payout,
  Permission,
  PlatformStats,
  Role,
  SystemConfig,
  Task,
  Ticket,
  TicketMessage,
  User,
} from './types';

export const mockStats: PlatformStats = {
  totalUsers: 12840,
  totalBusinesses: 412,
  totalAgents: 3180,
  activeTasks: 892,
  completedTasks: 18743,
  openDisputes: 17,
  pendingKyc: 44,
  gmv: 2_410_300,
  revenue: 184_820,
  revenueSeries: Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.now() - (13 - i) * 24 * 3600 * 1000).toISOString().slice(0, 10),
    revenue: 9000 + Math.round(Math.sin(i / 2) * 2500 + Math.random() * 3000),
    gmv: 120000 + Math.round(Math.cos(i / 3) * 20000 + Math.random() * 40000),
  })),
};

export const mockUsers: User[] = Array.from({ length: 24 }, (_, i) => ({
  id: `u_${1000 + i}`,
  email: `user${i + 1}@workstream.dev`,
  phone: `+25470000${(i + 10).toString().padStart(4, '0')}`,
  firstName: ['Ada', 'Kofi', 'Amina', 'Zuri', 'Tomiwa', 'Neo'][i % 6],
  lastName: ['Okoro', 'Mensah', 'Njuguna', 'Dlamini', 'Bello', 'Kamau'][i % 6],
  role: (['ADMIN', 'BUSINESS', 'AGENT', 'SUPPORT', 'FINANCE'] as const)[i % 5],
  status: (['ACTIVE', 'ACTIVE', 'SUSPENDED', 'PENDING'] as const)[i % 4],
  emailVerified: i % 3 !== 0,
  lastLoginAt: new Date(Date.now() - i * 3600 * 1000).toISOString(),
  createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
  updatedAt: new Date().toISOString(),
}));

export const mockBusinesses: Business[] = Array.from({ length: 18 }, (_, i) => ({
  id: `b_${2000 + i}`,
  name: `${['Acme', 'Globex', 'Initech', 'Umbrella', 'Stark', 'Wayne'][i % 6]} ${['Ltd', 'Inc', 'Co', 'Group'][i % 4]}`,
  legalName: 'Registered legal name',
  email: `ops@business${i + 1}.com`,
  phone: `+1555000${(1000 + i).toString()}`,
  country: ['KE', 'NG', 'GH', 'ZA', 'US', 'UK'][i % 6],
  industry: ['SaaS', 'Retail', 'Logistics', 'Fintech', 'HealthTech'][i % 5],
  status: (['APPROVED', 'PENDING', 'SUSPENDED', 'APPROVED'] as const)[i % 4],
  ownerId: `u_${1000 + i}`,
  taskCount: 40 + i * 3,
  agentCount: 10 + (i % 7),
  createdAt: new Date(Date.now() - i * 86_400_000 * 2).toISOString(),
  updatedAt: new Date().toISOString(),
}));

export const mockAgents: Agent[] = Array.from({ length: 30 }, (_, i) => ({
  id: `a_${3000 + i}`,
  userId: `u_${1000 + i}`,
  fullName: `${['Ada', 'Kofi', 'Amina', 'Zuri', 'Tomiwa'][i % 5]} ${['Okoro', 'Mensah', 'Njuguna', 'Bello'][i % 4]}`,
  email: `agent${i + 1}@workstream.dev`,
  phone: `+25471${(2000000 + i).toString()}`,
  country: ['KE', 'NG', 'GH', 'ZA', 'UG'][i % 5],
  skills: [['Data entry', 'Translation'], ['Chat support', 'QA'], ['Annotation'], ['Moderation']][i % 4],
  rating: 3.5 + (i % 15) / 10,
  tasksCompleted: 20 + i * 4,
  status: (['ACTIVE', 'ONLINE', 'PENDING_KYC', 'SUSPENDED', 'OFFLINE'] as const)[i % 5],
  kycStatus: (['APPROVED', 'PENDING', 'APPROVED', 'REJECTED', 'NOT_STARTED'] as const)[i % 5],
  onlineNow: i % 3 === 0,
  lastSeenAt: new Date(Date.now() - i * 60_000).toISOString(),
  createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
  updatedAt: new Date().toISOString(),
}));

export const mockTasks: Task[] = Array.from({ length: 40 }, (_, i) => ({
  id: `t_${4000 + i}`,
  title: [
    'Verify seller documents',
    'Moderate marketplace listings',
    'Label training images',
    'Customer chat (night shift)',
    'Translate product catalog',
    'QA checkout flow',
  ][i % 6],
  businessId: `b_${2000 + (i % 18)}`,
  businessName: `Business ${(i % 18) + 1}`,
  assignedAgentId: i % 4 === 0 ? undefined : `a_${3000 + (i % 30)}`,
  assignedAgentName: i % 4 === 0 ? undefined : `Agent ${(i % 30) + 1}`,
  status: (['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'DISPUTED'] as const)[i % 6],
  priority: (['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const)[i % 4],
  budget: 50 + i * 12,
  currency: 'USD',
  createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
  updatedAt: new Date().toISOString(),
  dueAt: new Date(Date.now() + (i - 10) * 3600_000).toISOString(),
}));

export const mockPayments: Payment[] = Array.from({ length: 30 }, (_, i) => ({
  id: `p_${5000 + i}`,
  type: (['DEPOSIT', 'ESCROW', 'RELEASE', 'PAYOUT', 'FEE'] as const)[i % 5],
  status: (['COMPLETED', 'PENDING', 'FAILED', 'COMPLETED', 'PROCESSING'] as const)[i % 5],
  amount: 25 + i * 15,
  currency: 'USD',
  fee: Math.round((25 + i * 15) * 0.03 * 100) / 100,
  userId: `u_${1000 + (i % 24)}`,
  businessId: `b_${2000 + (i % 18)}`,
  agentId: `a_${3000 + (i % 30)}`,
  taskId: `t_${4000 + (i % 40)}`,
  method: ['mpesa', 'stripe', 'bank', 'wallet'][i % 4],
  reference: `REF-${100000 + i}`,
  createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
  completedAt: new Date(Date.now() - i * 3300_000).toISOString(),
}));

export const mockPayouts: Payout[] = Array.from({ length: 15 }, (_, i) => ({
  id: `po_${6000 + i}`,
  agentId: `a_${3000 + i}`,
  agentName: `Agent ${i + 1}`,
  amount: 120 + i * 35,
  currency: 'USD',
  status: (['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const)[i % 4],
  method: ['mpesa', 'bank', 'wallet'][i % 3],
  reference: `PO-${200000 + i}`,
  createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
  processedAt: new Date(Date.now() - i * 80_000_000).toISOString(),
}));

export const mockDisputes: Dispute[] = Array.from({ length: 10 }, (_, i) => ({
  id: `d_${7000 + i}`,
  taskId: `t_${4000 + i * 2}`,
  taskTitle: `Disputed task #${i + 1}`,
  openedByUserId: `u_${1000 + i}`,
  openedByName: `Complainant ${i + 1}`,
  againstUserId: `u_${1020 + i}`,
  reason: ['Work not delivered', 'Quality issue', 'Late delivery', 'Unauthorized charge'][i % 4],
  status: (['OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED'] as const)[i % 4],
  createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
}));

export const mockAuditLogs: AuditLog[] = Array.from({ length: 40 }, (_, i) => ({
  id: `al_${8000 + i}`,
  actorId: `u_${1000 + (i % 24)}`,
  actorEmail: `admin${(i % 5) + 1}@workstream.dev`,
  action: ['LOGIN', 'USER_SUSPEND', 'BUSINESS_APPROVE', 'PAYOUT_RELEASE', 'FLAG_TOGGLE', 'KYC_APPROVE'][i % 6],
  resource: ['user', 'business', 'agent', 'payout', 'system.flag', 'kyc'][i % 6],
  resourceId: `res_${i}`,
  ipAddress: `102.${i % 255}.${(i * 3) % 255}.${(i * 7) % 255}`,
  userAgent: 'Mozilla/5.0',
  metadata: { note: 'demo audit log entry' },
  createdAt: new Date(Date.now() - i * 60_000 * 17).toISOString(),
}));

export const mockTickets: Ticket[] = Array.from({ length: 24 }, (_, i) => {
  const msgs: TicketMessage[] = Array.from({ length: 2 + (i % 4) }, (_, j) => ({
    id: `tm_${i}_${j}`,
    ticketId: `tk_${9000 + i}`,
    authorId: j % 2 === 0 ? `u_${1000 + i}` : `u_admin_${j}`,
    authorName: j % 2 === 0 ? `User ${i + 1}` : `Support ${(j % 3) + 1}`,
    authorRole: j % 2 === 0 ? 'USER' : 'SUPPORT',
    body: j === 0
      ? ['Payment failed on checkout.', 'Agent never responded to the task.', 'KYC stuck in review for 3 days.', 'Payout missing.'][i % 4]
      : 'Following up — please check and get back to us.',
    internal: j === 1 && i % 3 === 0,
    createdAt: new Date(Date.now() - (2 + (i % 4)) * 3600_000 - j * 1800_000).toISOString(),
  }));
  return {
    id: `tk_${9000 + i}`,
    subject: ['Payment failed', 'Task disputed', 'KYC stuck', 'Payout missing', 'App crash', 'Login issue'][i % 6] + ` #${i + 1}`,
    status: (['OPEN', 'PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const)[i % 5],
    priority: (['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const)[i % 4],
    category: ['Payments', 'Tasks', 'Accounts', 'KYC', 'Technical'][i % 5],
    requesterId: `u_${1000 + i}`,
    requesterName: `User ${i + 1}`,
    requesterEmail: `user${i + 1}@workstream.dev`,
    assigneeId: i % 3 === 0 ? undefined : `u_support_${i % 4}`,
    assigneeName: i % 3 === 0 ? undefined : `Support Agent ${(i % 4) + 1}`,
    lastMessageAt: new Date(Date.now() - i * 3600_000).toISOString(),
    messageCount: msgs.length,
    slaBreached: i % 7 === 0,
    createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - i * 3600_000).toISOString(),
    messages: msgs,
  };
});

export const mockCannedResponses: CannedResponse[] = [
  { id: 'cn_1', title: 'KYC delay apology', body: 'Apologies for the delay. Our compliance team is reviewing your KYC documents. We aim to respond within 24 hours.', tags: ['kyc'] },
  { id: 'cn_2', title: 'Payout queued', body: 'Your payout has been queued and will be processed within 1–3 business days. Reference: {{ref}}.', tags: ['payouts'] },
  { id: 'cn_3', title: 'Payment retry', body: 'Please try the payment again. If the issue persists, contact your bank or try an alternative method.', tags: ['payments'] },
  { id: 'cn_4', title: 'Dispute opened', body: 'We have opened a dispute on your behalf. A resolution agent will reach out within 48 hours.', tags: ['disputes'] },
];

export const mockModerationItems: ModerationItem[] = Array.from({ length: 20 }, (_, i) => ({
  id: `mod_${10_000 + i}`,
  contentType: (['MESSAGE', 'PROFILE', 'TASK_DESCRIPTION', 'REVIEW', 'ATTACHMENT'] as const)[i % 5],
  contentPreview: [
    'Send me your phone off-platform and I will pay you directly.',
    'This agent is a scammer!!!',
    'Do this task for free and I will tip you later off-platform.',
    'Contact me on telegram @xxx for cheaper rates.',
    'Attachment: invoice_fake.pdf flagged by scanner.',
  ][i % 5],
  authorId: `u_${1000 + (i % 24)}`,
  authorName: `User ${(i % 24) + 1}`,
  reason: ['Off-platform solicitation', 'Abusive language', 'Fraud risk', 'PII leak', 'Spam'][i % 5],
  aiScore: Math.round(40 + Math.random() * 60),
  flagCount: 1 + (i % 5),
  status: (['PENDING', 'PENDING', 'APPROVED', 'REJECTED', 'ESCALATED'] as const)[i % 5],
  createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
}));

export const mockPermissions: Permission[] = [
  { key: 'users.read', label: 'View users', group: 'Users' },
  { key: 'users.write', label: 'Edit users', group: 'Users' },
  { key: 'users.impersonate', label: 'Impersonate users', group: 'Users' },
  { key: 'businesses.read', label: 'View businesses', group: 'Businesses' },
  { key: 'businesses.write', label: 'Approve/suspend businesses', group: 'Businesses' },
  { key: 'agents.read', label: 'View agents', group: 'Agents' },
  { key: 'agents.kyc', label: 'Review agent KYC', group: 'Agents' },
  { key: 'tasks.read', label: 'View tasks', group: 'Tasks' },
  { key: 'tasks.reassign', label: 'Force-reassign tasks', group: 'Tasks' },
  { key: 'payments.read', label: 'View payments', group: 'Finance' },
  { key: 'payments.refund', label: 'Issue refunds', group: 'Finance' },
  { key: 'payouts.approve', label: 'Approve payouts', group: 'Finance' },
  { key: 'disputes.resolve', label: 'Resolve disputes', group: 'Disputes' },
  { key: 'tickets.manage', label: 'Manage support tickets', group: 'Support' },
  { key: 'moderation.review', label: 'Moderate content', group: 'Moderation' },
  { key: 'audit.read', label: 'View audit logs', group: 'Compliance' },
  { key: 'system.config', label: 'Edit system config', group: 'System' },
  { key: 'roles.manage', label: 'Manage roles', group: 'System' },
];

export const mockRoles: Role[] = [
  {
    id: 'r_super', name: 'SUPER_ADMIN', description: 'Unrestricted access', builtIn: true, userCount: 2,
    permissions: mockPermissions.map((p) => p.key),
  },
  {
    id: 'r_admin', name: 'ADMIN', description: 'Day-to-day platform admin', builtIn: true, userCount: 8,
    permissions: ['users.read', 'users.write', 'businesses.read', 'businesses.write', 'agents.read', 'agents.kyc', 'tasks.read', 'tasks.reassign', 'disputes.resolve', 'tickets.manage', 'audit.read'],
  },
  {
    id: 'r_finance', name: 'FINANCE', description: 'Read-only finance + payout approval', builtIn: true, userCount: 4,
    permissions: ['payments.read', 'payments.refund', 'payouts.approve', 'audit.read'],
  },
  {
    id: 'r_support', name: 'SUPPORT', description: 'Support tickets and user help', builtIn: true, userCount: 12,
    permissions: ['users.read', 'tickets.manage', 'tasks.read', 'disputes.resolve'],
  },
  {
    id: 'r_ops', name: 'OPS', description: 'Operations: KYC + moderation', builtIn: true, userCount: 6,
    permissions: ['agents.read', 'agents.kyc', 'moderation.review', 'businesses.read'],
  },
];

export const mockAnalytics: AnalyticsBundle = {
  revenueSeries: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10),
    revenue: 8000 + Math.round(Math.sin(i / 3) * 2000 + Math.random() * 2000),
    gmv: 100_000 + Math.round(Math.cos(i / 4) * 20_000 + Math.random() * 30_000),
    fees: 900 + Math.round(Math.sin(i / 5) * 250 + Math.random() * 200),
  })),
  cohortRetention: Array.from({ length: 8 }, (_, i) => {
    const size = 200 + Math.round(Math.random() * 400);
    return {
      cohort: new Date(Date.now() - (7 - i) * 30 * 86_400_000).toISOString().slice(0, 7),
      size,
      w1: Math.round(size * (0.7 - i * 0.02)),
      w2: Math.round(size * (0.55 - i * 0.02)),
      w4: Math.round(size * (0.4 - i * 0.02)),
      w8: Math.round(size * (0.28 - i * 0.02)),
    };
  }),
  funnel: [
    { step: 'Signup', users: 10_000 },
    { step: 'Verified email', users: 7_800 },
    { step: 'Completed KYC', users: 5_400 },
    { step: 'First task', users: 3_200 },
    { step: 'First payout', users: 1_850 },
  ],
  geoBreakdown: [
    { country: 'KE', users: 4800, gmv: 620_000 },
    { country: 'NG', users: 3100, gmv: 540_000 },
    { country: 'GH', users: 1900, gmv: 310_000 },
    { country: 'ZA', users: 1450, gmv: 290_000 },
    { country: 'UG', users: 1100, gmv: 150_000 },
    { country: 'TZ', users: 820, gmv: 112_000 },
    { country: 'US', users: 430, gmv: 380_000 },
  ],
  topBusinesses: Array.from({ length: 8 }, (_, i) => ({
    id: `b_${2000 + i}`,
    name: `${['Acme', 'Globex', 'Initech', 'Umbrella', 'Stark', 'Wayne', 'Nimbus', 'Axiom'][i]} Ltd`,
    gmv: 300_000 - i * 28_000,
    tasks: 1400 - i * 120,
  })),
  topAgents: Array.from({ length: 8 }, (_, i) => ({
    id: `a_${3000 + i}`,
    name: `Agent ${i + 1}`,
    earnings: 18_000 - i * 1200,
    tasks: 320 - i * 22,
    rating: 4.9 - i * 0.08,
  })),
};

export const mockSystemConfig: SystemConfig = {
  flags: [
    { key: 'signups.enabled', label: 'Public signups', enabled: true, description: 'Allow new users to self-register' },
    { key: 'payouts.enabled', label: 'Agent payouts', enabled: true, description: 'Globally enable payout runs' },
    { key: 'kyc.strict', label: 'Strict KYC', enabled: false, description: 'Require full KYC before any task assignment' },
    { key: 'realtime.websocket', label: 'Realtime dashboards', enabled: true, description: 'WebSocket live updates' },
    { key: 'moderation.ai', label: 'AI content moderation', enabled: false, description: 'Route content through AI moderation' },
  ],
  pricing: {
    platformFeePct: 12,
    minPayoutAmount: 20,
    payoutCurrencies: ['USD', 'KES', 'NGN', 'GHS', 'ZAR'],
  },
};
