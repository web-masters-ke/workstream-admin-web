'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { get, post, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { downloadCsv } from '@/lib/export';

// ── types ──────────────────────────────────────────────────────────────────
interface BusinessWallet {
  businessId: string;
  businessName: string;
  balance: number;
  currency: string;
  lockedBalance: number;
  lastTransaction: string | null;
}

interface WalletTx {
  id: string;
  type: string;
  amount: number;
  description: string;
  balanceAfter: number;
  createdAt: string;
}

interface TxPage {
  items: WalletTx[];
  total: number;
  page: number;
  pageSize: number;
}

// legacy types kept for agent tab
interface AgentWallet {
  id: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  currency: string;
  balance: number;
  status: string;
  updatedAt: string;
  createdAt: string;
}

interface TenantWallet {
  id: string;
  businessId: string;
  businessName: string;
  businessEmail: string;
  businessStatus: string;
  currency: string;
  balance: number;
  status: string;
  updatedAt: string;
  createdAt: string;
}

type TabType = 'business' | 'agents';

const QUICK_AMOUNTS = [500, 1000, 2500, 5000, 10000, 50000];
const TX_LIMIT = 20;

// ── helpers ────────────────────────────────────────────────────────────────
function isCredit(type: string) {
  return ['CREDIT', 'TOPUP', 'REFUND', 'ADJUSTMENT', 'FUND'].includes(type.toUpperCase());
}

// ── component ──────────────────────────────────────────────────────────────
export default function WalletsPage() {
  const [tab, setTab] = useState<TabType>('business');

  // ── business wallets (new backend shape) ──
  const [wallets, setWallets] = useState<BusinessWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [q, setQ] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [minBal, setMinBal] = useState('');
  const [maxBal, setMaxBal] = useState('');

  // fund/deduct drawer
  const [fundTarget, setFundTarget] = useState<BusinessWallet | null>(null);
  const [fundAmount, setFundAmount] = useState<number>(1000);
  const [fundNote, setFundNote] = useState('');
  const [fundOp, setFundOp] = useState<'credit' | 'debit'>('credit');
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [fundSuccess, setFundSuccess] = useState<string | null>(null);

  // transaction history panel (side drawer)
  const [txTarget, setTxTarget] = useState<BusinessWallet | null>(null);
  const [txData, setTxData] = useState<WalletTx[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txLoading, setTxLoading] = useState(false);

  // ── agent wallets (legacy) ──
  const [agentWallets, setAgentWallets] = useState<AgentWallet[]>([]);
  const [agentWalletsLoading, setAgentWalletsLoading] = useState(false);
  const [agentFundTarget, setAgentFundTarget] = useState<AgentWallet | null>(null);
  const [agentFundAmount, setAgentFundAmount] = useState<number>(1000);
  const [agentFundNote, setAgentFundNote] = useState('');
  const [agentFunding, setAgentFunding] = useState(false);
  const [agentFundError, setAgentFundError] = useState<string | null>(null);
  const [agentFundSuccess, setAgentFundSuccess] = useState<string | null>(null);

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await get<BusinessWallet[]>('/admin/wallets');
      setWallets(Array.isArray(data) ? data : (data as any).items ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAgentWallets = useCallback(async () => {
    setAgentWalletsLoading(true);
    try {
      const data = await get<AgentWallet[]>('/admin/agent-wallets');
      setAgentWallets(Array.isArray(data) ? data : (data as any).items ?? []);
    } catch { /* non-critical */ } finally {
      setAgentWalletsLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadAgentWallets(); }, [load, loadAgentWallets]);

  // ── tx history ────────────────────────────────────────────────────────────
  const loadTx = useCallback(async (businessId: string, page: number) => {
    setTxLoading(true);
    try {
      const data = await get<TxPage | WalletTx[]>(
        `/admin/wallets/${businessId}/transactions?page=${page}&limit=${TX_LIMIT}`
      );
      if (Array.isArray(data)) {
        setTxData(data);
        setTxTotal(data.length);
      } else {
        setTxData((data as TxPage).items ?? []);
        setTxTotal((data as TxPage).total ?? 0);
      }
      setTxPage(page);
    } catch { /* non-critical */ } finally {
      setTxLoading(false);
    }
  }, []);

  const openTxPanel = (w: BusinessWallet) => {
    setTxTarget(w);
    setTxData([]);
    setTxPage(1);
    loadTx(w.businessId, 1);
  };

  // ── filters ───────────────────────────────────────────────────────────────
  const currencies = useMemo(
    () => Array.from(new Set(wallets.map((w) => w.currency))).sort(),
    [wallets]
  );

  const filtered = useMemo(() => {
    return wallets.filter((w) => {
      if (q) {
        const s = q.toLowerCase();
        if (!w.businessName.toLowerCase().includes(s)) return false;
      }
      if (currencyFilter && w.currency !== currencyFilter) return false;
      if (minBal !== '' && w.balance < Number(minBal)) return false;
      if (maxBal !== '' && w.balance > Number(maxBal)) return false;
      return true;
    });
  }, [wallets, q, currencyFilter, minBal, maxBal]);

  // ── stats ─────────────────────────────────────────────────────────────────
  const totalBalance = wallets.reduce((a, w) => a + w.balance, 0);
  const totalLocked = wallets.reduce((a, w) => a + (w.lockedBalance ?? 0), 0);
  const activeToday = wallets.filter((w) => {
    if (!w.lastTransaction) return false;
    const d = new Date(w.lastTransaction);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  // ── fund drawer ───────────────────────────────────────────────────────────
  const openFund = (w: BusinessWallet) => {
    setFundTarget(w);
    setFundAmount(1000);
    setFundNote('');
    setFundOp('credit');
    setFundError(null);
    setFundSuccess(null);
  };

  const closeFund = () => {
    setFundTarget(null);
    setFundError(null);
    setFundSuccess(null);
  };

  const submitFund = async () => {
    if (!fundTarget) return;
    if (fundAmount < 1) { setFundError('Amount must be at least 1'); return; }
    setFunding(true);
    setFundError(null);
    setFundSuccess(null);
    try {
      const endpoint = `/admin/wallets/${fundTarget.businessId}/fund`;
      const signedCents = fundOp === 'credit'
        ? Math.round(fundAmount * 100)
        : -Math.round(fundAmount * 100);
      const res = await post<any>(endpoint, {
        amountCents: signedCents,
        type: fundOp === 'credit' ? 'CREDIT' : 'DEBIT',
        note: fundNote || undefined,
      });
      const delta = fundOp === 'credit' ? fundAmount : -fundAmount;
      const newBal: number = (res as any).balance ?? (res as any).newBalance ?? fundTarget.balance + delta;
      setWallets((prev) =>
        prev.map((w) => w.businessId === fundTarget.businessId ? { ...w, balance: newBal } : w)
      );
      setFundTarget((prev) => prev ? { ...prev, balance: newBal } : prev);
      setFundSuccess(
        `Successfully ${fundOp === 'credit' ? 'added' : 'deducted'} ${formatMoney(fundAmount, fundTarget.currency)} ${fundOp === 'credit' ? 'to' : 'from'} ${fundTarget.businessName}'s wallet. New balance: ${formatMoney(newBal, fundTarget.currency)}`
      );
      setFundAmount(1000);
      setFundNote('');
    } catch (e) {
      setFundError(errorMessage(e));
    } finally {
      setFunding(false);
    }
  };

  // ── agent fund ────────────────────────────────────────────────────────────
  const openAgentFund = (w: AgentWallet) => {
    setAgentFundTarget(w);
    setAgentFundAmount(1000);
    setAgentFundNote('');
    setAgentFundError(null);
    setAgentFundSuccess(null);
  };
  const closeAgentFund = () => { setAgentFundTarget(null); setAgentFundError(null); setAgentFundSuccess(null); };
  const submitAgentFund = async () => {
    if (!agentFundTarget) return;
    if (agentFundAmount < 1) { setAgentFundError('Amount must be at least 1'); return; }
    setAgentFunding(true);
    setAgentFundError(null);
    setAgentFundSuccess(null);
    try {
      const res = await post<any>(`/admin/agent-wallets/${agentFundTarget.agentId}/fund`, {
        amountCents: Math.round(agentFundAmount * 100),
        note: agentFundNote || undefined,
      });
      const newBal: number = (res as any).newBalance ?? agentFundTarget.balance + agentFundAmount;
      setAgentWallets((prev) =>
        prev.map((w) => w.agentId === agentFundTarget.agentId ? { ...w, balance: newBal } : w)
      );
      setAgentFundSuccess(
        `Successfully added ${formatMoney(agentFundAmount, agentFundTarget.currency)} to ${agentFundTarget.agentName}'s wallet.`
      );
      setAgentFundAmount(1000);
      setAgentFundNote('');
    } catch (e) {
      setAgentFundError(errorMessage(e));
    } finally {
      setAgentFunding(false);
    }
  };

  // ── CSV export ────────────────────────────────────────────────────────────
  const exportCsv = () => {
    downloadCsv('wallets.csv', filtered, [
      ['Business', (w) => (w as BusinessWallet).businessName],
      ['Balance', (w) => (w as BusinessWallet).balance],
      ['Locked Balance', (w) => (w as BusinessWallet).lockedBalance],
      ['Currency', (w) => (w as BusinessWallet).currency],
      ['Last Transaction', (w) => (w as BusinessWallet).lastTransaction ?? ''],
    ] as [string, keyof BusinessWallet | ((row: BusinessWallet) => unknown)][]);
  };

  // ── columns ───────────────────────────────────────────────────────────────
  const columns: Column<BusinessWallet>[] = [
    {
      key: 'business',
      header: 'Business',
      render: (w) => (
        <div className="font-medium text-fg">{w.businessName}</div>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (w) => (
        <span className={`font-semibold tabular-nums ${w.balance === 0 ? 'text-muted' : 'text-fg'}`}>
          {formatMoney(w.balance, w.currency)}
        </span>
      ),
    },
    {
      key: 'locked',
      header: 'Locked',
      render: (w) => (
        <span className="tabular-nums text-muted">
          {formatMoney(w.lockedBalance ?? 0, w.currency)}
        </span>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      render: (w) => <Badge tone="neutral">{w.currency}</Badge>,
    },
    {
      key: 'lastActivity',
      header: 'Last Activity',
      render: (w) => (
        <span className="text-xs text-muted">
          {w.lastTransaction ? formatDate(w.lastTransaction) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (w) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => { e.stopPropagation(); openTxPanel(w); }}
          >
            History
          </Button>
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); openFund(w); }}
          >
            Fund
          </Button>
        </div>
      ),
    },
  ];

  if (error) return (
    <div className="py-20 text-center">
      <p className="text-danger">{error}</p>
      <button onClick={load} className="mt-2 text-sm text-brand underline">Retry</button>
    </div>
  );

  const agentTotalBalance = agentWallets.reduce((a, w) => a + w.balance, 0);
  const txTotalPages = Math.ceil(txTotal / TX_LIMIT);

  return (
    <>
      <PageHeader
        title="Wallets"
        description="View, fund, and audit business and agent wallets."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
            <Button variant="secondary" onClick={() => { load(); loadAgentWallets(); }}>Refresh</Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border">
        {(['business', 'agents'] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t === 'business' ? 'Business wallets' : 'Agent wallets'}
          </button>
        ))}
      </div>

      {/* ── BUSINESS WALLETS TAB ── */}
      {tab === 'business' && (
        <>
          {/* Stats */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Wallets" value={wallets.length} />
            <StatCard label="Total Balance" value={formatMoney(totalBalance)} hint="across all wallets" />
            <StatCard label="Total Locked" value={formatMoney(totalLocked)} hint="held in escrow" />
            <StatCard label="Active Today" value={activeToday} hint="had a transaction today" />
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search business name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-64"
            />
            <Select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="w-32">
              <option value="">All currencies</option>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input
              type="number"
              placeholder="Min balance"
              value={minBal}
              onChange={(e) => setMinBal(e.target.value)}
              className="w-32"
            />
            <Input
              type="number"
              placeholder="Max balance"
              value={maxBal}
              onChange={(e) => setMaxBal(e.target.value)}
              className="w-32"
            />
            {(q || currencyFilter || minBal || maxBal) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setQ(''); setCurrencyFilter(''); setMinBal(''); setMaxBal(''); }}
              >
                Clear
              </Button>
            )}
            <span className="ml-auto text-xs text-muted">{filtered.length} of {wallets.length}</span>
          </div>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>All business wallets</CardTitle>
            </CardHeader>
            <CardBody>
              <DataTable
                columns={columns}
                rows={filtered}
                getRowId={(w) => w.businessId}
                loading={loading}
                onRowClick={openFund}
              />
            </CardBody>
          </Card>

          {/* Fund / Deduct Drawer */}
          <Drawer
            open={!!fundTarget}
            onClose={closeFund}
            title={fundTarget ? `${fundTarget.businessName} — Wallet` : ''}
            width="w-[520px]"
            footer={
              fundTarget && !fundSuccess ? (
                <div className="flex gap-2">
                  <Button onClick={submitFund} disabled={funding}>
                    {funding
                      ? 'Processing…'
                      : `${fundOp === 'credit' ? 'Credit' : 'Deduct'} ${formatMoney(fundAmount, fundTarget.currency)}`}
                  </Button>
                  <Button variant="ghost" onClick={closeFund}>Cancel</Button>
                </div>
              ) : null
            }
          >
            {fundTarget && (
              <div className="space-y-5 text-sm">
                {/* Balance card */}
                <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted">Current balance</div>
                    <div className="text-2xl font-bold text-fg">
                      {formatMoney(fundTarget.balance, fundTarget.currency)}
                    </div>
                    {(fundTarget.lockedBalance ?? 0) > 0 && (
                      <div className="text-xs text-muted mt-0.5">
                        Locked: {formatMoney(fundTarget.lockedBalance, fundTarget.currency)}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-muted">{fundTarget.businessName}</div>
                    <div className="text-xs text-muted mt-0.5">{fundTarget.currency}</div>
                  </div>
                </div>

                {/* Success banner */}
                {fundSuccess && (
                  <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3">
                    <div className="flex items-start gap-2">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-success">{fundSuccess}</p>
                    </div>
                    <button onClick={closeFund} className="mt-3 text-xs text-brand-600 underline">Close</button>
                  </div>
                )}

                {!fundSuccess && (
                  <>
                    {/* Operation toggle */}
                    <div>
                      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Operation</div>
                      <div className="flex gap-2">
                        {(['credit', 'debit'] as const).map((op) => (
                          <button
                            key={op}
                            onClick={() => setFundOp(op)}
                            className={`flex-1 rounded-md border py-2 text-sm font-medium transition-colors capitalize ${
                              fundOp === op
                                ? op === 'credit'
                                  ? 'border-success bg-success/10 text-success'
                                  : 'border-danger bg-danger/10 text-danger'
                                : 'border-border text-muted hover:bg-surface-2 hover:text-fg'
                            }`}
                          >
                            {op === 'credit' ? '+ Credit' : '− Deduct'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick amounts */}
                    <div>
                      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                        Amount ({fundTarget.currency})
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {QUICK_AMOUNTS.map((a) => (
                          <button
                            key={a}
                            onClick={() => setFundAmount(a)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              fundAmount === a
                                ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                                : 'border-border text-muted hover:bg-surface-2 hover:text-fg'
                            }`}
                          >
                            {a.toLocaleString()}
                          </button>
                        ))}
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={fundAmount}
                        onChange={(e) => setFundAmount(Number(e.target.value))}
                        placeholder="Custom amount"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                        Description / Reference (optional)
                      </div>
                      <textarea
                        value={fundNote}
                        onChange={(e) => setFundNote(e.target.value)}
                        placeholder="e.g. Onboarding credit, manual adjustment, invoice ref…"
                        className="h-20 w-full resize-none rounded-md border border-border bg-surface p-2.5 text-sm text-fg placeholder:text-muted focus:border-brand-600 focus:outline-none"
                      />
                    </div>

                    {/* Preview */}
                    <div className={`rounded-lg border px-4 py-3 ${
                      fundOp === 'credit' ? 'border-success/20 bg-success/5' : 'border-danger/20 bg-danger/5'
                    }`}>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">
                          {fundOp === 'credit' ? 'Credit amount' : 'Deduct amount'}
                        </span>
                        <span className={`font-semibold ${fundOp === 'credit' ? 'text-success' : 'text-danger'}`}>
                          {fundOp === 'credit' ? '+' : '−'}{formatMoney(fundAmount, fundTarget.currency)}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-xs">
                        <span className="text-muted">Balance after</span>
                        <span className="font-medium text-fg">
                          {formatMoney(
                            fundOp === 'credit'
                              ? fundTarget.balance + fundAmount
                              : Math.max(0, fundTarget.balance - fundAmount),
                            fundTarget.currency
                          )}
                        </span>
                      </div>
                    </div>

                    {fundError && (
                      <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                        {fundError}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </Drawer>

          {/* Transaction History Drawer */}
          <Drawer
            open={!!txTarget}
            onClose={() => setTxTarget(null)}
            title={txTarget ? `${txTarget.businessName} — Transactions` : ''}
            width="w-[620px]"
          >
            {txTarget && (
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted">Current balance</div>
                    <div className="text-xl font-bold text-fg">{formatMoney(txTarget.balance, txTarget.currency)}</div>
                  </div>
                  <div className="text-xs text-muted">{txTotal} transactions total</div>
                </div>

                {txLoading ? (
                  <div className="py-8 text-center text-xs text-muted">Loading transactions…</div>
                ) : txData.length === 0 ? (
                  <div className="rounded-md border border-border bg-surface-2 py-8 text-center text-xs text-muted">
                    No transactions found
                  </div>
                ) : (
                  <>
                    <div className="overflow-auto rounded-md border border-border">
                      <table className="min-w-full text-xs">
                        <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-muted">
                          <tr>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Type</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                            <th className="px-3 py-2 text-left">Description</th>
                            <th className="px-3 py-2 text-right">Balance After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {txData.map((tx) => (
                            <tr key={tx.id} className="hover:bg-surface-2 transition-colors">
                              <td className="px-3 py-2 text-muted whitespace-nowrap">{formatDate(tx.createdAt)}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  isCredit(tx.type)
                                    ? 'bg-success/15 text-success'
                                    : 'bg-danger/15 text-danger'
                                }`}>
                                  {tx.type}
                                </span>
                              </td>
                              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${
                                isCredit(tx.type) ? 'text-success' : 'text-danger'
                              }`}>
                                {isCredit(tx.type) ? '+' : '−'}{formatMoney(tx.amount, txTarget.currency)}
                              </td>
                              <td className="px-3 py-2 text-muted max-w-[180px] truncate">{tx.description || '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-fg">
                                {formatMoney(tx.balanceAfter, txTarget.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {txTotalPages > 1 && (
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>Page {txPage} of {txTotalPages}</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={txPage <= 1 || txLoading}
                            onClick={() => loadTx(txTarget.businessId, txPage - 1)}
                          >
                            Prev
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={txPage >= txTotalPages || txLoading}
                            onClick={() => loadTx(txTarget.businessId, txPage + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </Drawer>
        </>
      )}

      {/* ── AGENT WALLETS TAB ── */}
      {tab === 'agents' && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Total agent balances" value={formatMoney(agentTotalBalance)} />
            <StatCard label="Agent wallets" value={agentWallets.length} hint="across all agents" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Agent wallets</CardTitle>
            </CardHeader>
            <CardBody>
              {agentWalletsLoading ? (
                <div className="py-8 text-center text-sm text-muted">Loading…</div>
              ) : agentWallets.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted">No agent wallets found.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3 text-left">Agent</th>
                      <th className="px-4 py-3 text-left">Balance</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Last activity</th>
                      <th className="px-4 py-3 text-left"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {agentWallets.map((w) => (
                      <tr key={w.id} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-fg">{w.agentName}</div>
                          <div className="text-xs text-muted">{w.agentEmail}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold tabular-nums ${w.balance === 0 ? 'text-muted' : 'text-fg'}`}>
                            {formatMoney(w.balance, w.currency)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={w.status === 'ACTIVE' ? 'success' : 'danger'}>{w.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{formatDate(w.updatedAt)}</td>
                        <td className="px-4 py-3">
                          <Button size="sm" onClick={() => openAgentFund(w)}>Fund</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {/* Agent fund drawer */}
      <Drawer
        open={!!agentFundTarget}
        onClose={closeAgentFund}
        title={agentFundTarget ? `${agentFundTarget.agentName} — Wallet` : ''}
        width="w-[440px]"
        footer={
          agentFundTarget && !agentFundSuccess ? (
            <div className="flex gap-2">
              <Button onClick={submitAgentFund} disabled={agentFunding}>
                {agentFunding ? 'Processing…' : `Credit ${formatMoney(agentFundAmount, agentFundTarget.currency)}`}
              </Button>
              <Button variant="ghost" onClick={closeAgentFund}>Cancel</Button>
            </div>
          ) : null
        }
      >
        {agentFundTarget && (
          <div className="space-y-5 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted">Current balance</div>
                <div className="text-2xl font-bold text-fg">{formatMoney(agentFundTarget.balance, agentFundTarget.currency)}</div>
              </div>
              <div className="text-right text-xs text-muted">{agentFundTarget.agentEmail}</div>
            </div>

            {agentFundSuccess ? (
              <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3">
                <p className="text-success">{agentFundSuccess}</p>
                <button onClick={closeAgentFund} className="mt-3 text-xs text-brand-600 underline">Close</button>
              </div>
            ) : (
              <>
                <div>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Amount (KES)</div>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {QUICK_AMOUNTS.map((a) => (
                      <button
                        key={a}
                        onClick={() => setAgentFundAmount(a)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          agentFundAmount === a
                            ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                            : 'border-border text-muted hover:bg-surface-2 hover:text-fg'
                        }`}
                      >
                        {a.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={agentFundAmount}
                    onChange={(e) => setAgentFundAmount(Number(e.target.value))}
                    placeholder="Custom amount"
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Note (optional)</div>
                  <textarea
                    value={agentFundNote}
                    onChange={(e) => setAgentFundNote(e.target.value)}
                    placeholder="e.g. Bonus, manual top-up…"
                    className="h-16 w-full resize-none rounded-md border border-border bg-surface p-2.5 text-sm text-fg placeholder:text-muted focus:border-brand-600 focus:outline-none"
                  />
                </div>
                <div className="rounded-lg border border-brand-600/20 bg-brand-600/5 px-4 py-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Credit amount</span>
                    <span className="font-semibold text-brand-600">+{formatMoney(agentFundAmount, agentFundTarget.currency)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-muted">Balance after</span>
                    <span className="font-medium text-fg">{formatMoney(agentFundTarget.balance + agentFundAmount, agentFundTarget.currency)}</span>
                  </div>
                </div>
                {agentFundError && (
                  <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{agentFundError}</div>
                )}
              </>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
