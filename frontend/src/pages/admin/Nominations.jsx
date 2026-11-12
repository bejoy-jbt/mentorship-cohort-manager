import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, Copy, KeyRound, Search, UserCheck, UserPlus, Users, Pencil } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Badge } from '../../components/Badge';
import { Modal } from '../../components/Modal';
import { DataTable, PersonCell } from '../../components/DataTable';
import { NomineeForm } from '../../components/NomineeForm';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');
const inputClass =
  'w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

/**
 * Admin view of everything nominators have submitted, plus the nominator accounts.
 * The admin adds nominees to cohorts here (or from inside a cohort).
 */
export function Nominations() {
  const [activeTab, setActiveTab] = useState('trainees'); // 'trainees' | 'mentors' | 'nominators'
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const kind = activeTab === 'mentors' ? 'mentor' : 'trainee';
  const isNomineeTab = activeTab !== 'nominators';

  // ---- nominee tables ----
  const [search, setSearch] = useState('');
  const [allocation, setAllocation] = useState('all');
  const [nominatorFilter, setNominatorFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [editingNominee, setEditingNominee] = useState(null);
  const [selectedCohortIds, setSelectedCohortIds] = useState([]);
  const [selectedNominatorId, setSelectedNominatorId] = useState(null);
  const [detailsTab, setDetailsTab] = useState('mentors');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setSearch('');
    setPage(1);
    setEditingNominee(null);
  }, [activeTab]);
  useEffect(() => setPage(1), [debouncedSearch, allocation, nominatorFilter, limit]);

  const { data: nominees, isLoading: nomineesLoading } = useQuery({
    queryKey: ['adminNominees', kind, allocation, nominatorFilter, debouncedSearch, page, limit],
    queryFn: async () => {
      const res = await api.get(`/nominations/${kind}s`, {
        params: {
          allocation,
          nominator_id: nominatorFilter || undefined,
          search: debouncedSearch || undefined,
          page,
          limit,
        },
      });
      return res.data;
    },
    enabled: isNomineeTab,
    placeholderData: (previous) => previous,
  });

  const { data: nominators = [], isLoading: nominatorsLoading } = useQuery({
    queryKey: ['adminNominators'],
    queryFn: async () => (await api.get('/users/nominators')).data,
  });

  const { data: cohortsData } = useQuery({
    queryKey: ['cohorts', 'forAllocation'],
    queryFn: async () => (await api.get('/cohorts?limit=100')).data,
    enabled: !!editingNominee,
  });
  const openCohorts = (cohortsData?.items || []).filter((cohort) => cohort.status !== 'closed'
    || (editingNominee?.cohortIds || (editingNominee?.cohortId ? [editingNominee.cohortId] : [])).includes(cohort.id));

  const saveCohortMutation = useMutation({
    mutationFn: async () => {
      if (kind === 'mentor') {
        return (await api.put(`/nominations/mentors/${editingNominee.id}/cohorts`, { cohortIds: selectedCohortIds })).data;
      }
      return (await api.put(`/nominations/trainees/${editingNominee.id}/cohort`, { cohortId: selectedCohortIds[0] || null })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminNominees'] });
      queryClient.invalidateQueries({ queryKey: ['nomineePool'] });
      queryClient.invalidateQueries({ queryKey: ['cohorts'] });
      queryClient.invalidateQueries({ queryKey: ['adminNominators'] });
      showToast(`${kind === 'mentor' ? 'Mentor cohorts' : 'Trainee cohort'} updated`);
      setEditingNominee(null);
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Failed to update cohort assignment', 'error'),
  });

  const toggleMentorMutation = useMutation({
    mutationFn: async ({ id, isActive }) => api.put(`/nominations/mentors/${id}/status`, { isActive }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminNominees'] });
      queryClient.invalidateQueries({ queryKey: ['cohorts'] });
      queryClient.invalidateQueries({ queryKey: ['cohortMentors'] });
      showToast(`Mentor account ${variables.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Could not update mentor account', 'error'),
  });

  const { data: nominatorDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['nominatorSubmissions', selectedNominatorId],
    queryFn: async () => (await api.get(`/nominations/by-nominator/${selectedNominatorId}`)).data,
    enabled: !!selectedNominatorId,
  });

  const addNomineeMutation = useMutation({
    mutationFn: async (payload) => (await api.post(`/nominations/${kind}s`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminNominees'] });
      showToast(`${kind === 'trainee' ? 'Trainee' : 'Mentor'} added to the nominations list`);
      setIsAddOpen(false);
    },
    onError: (err) => showToast(err.response?.data?.detail || `Failed to add ${kind}`, 'error'),
  });

  const openAssignmentEditor = (row) => {
    setEditingNominee(row);
    setSelectedCohortIds(kind === 'mentor' ? (row.cohortIds || []) : (row.cohortId ? [row.cohortId] : []));
  };

  const nomineeColumns = kind === 'mentor' ? [
    {
      key: 'mentor', header: 'Mentor', className: 'w-[22%]', headerClassName: 'w-[22%]',
      render: (row) => <div className="min-w-0 space-y-1"><PersonCell primary={row.name} secondary={row.email} /><span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">{row.employeeId || 'No employee ID'}</span></div>,
    },
    {
      key: 'location', header: 'Location', className: 'w-[15%]', headerClassName: 'w-[15%]',
      render: (row) => <div className="min-w-0"><div className="truncate font-medium text-slate-700">{row.location || '—'}</div>{row.timezone && <div className="truncate text-xs text-slate-400">{row.timezone}</div>}</div>,
    },
    { key: 'nominatorName', header: 'Nominated by', className: 'w-[13%]', headerClassName: 'w-[13%]', render: (row) => <span className="text-sm">{row.nominatorName || 'Platform Administrator'}</span> },
    { key: 'createdAt', header: 'Date nominated', className: 'w-[11%]', headerClassName: 'w-[11%]', render: (row) => <span className="whitespace-nowrap text-sm text-slate-600">{formatDate(row.createdAt)}</span> },
    {
      key: 'cohorts', header: 'Cohort assignments', className: 'w-[23%]', headerClassName: 'w-[23%]',
      render: (row) => {
        const names = row.cohortNames?.length ? row.cohortNames : (row.cohortName ? [row.cohortName] : []);
        if (!names.length) return <Badge variant="draft">Unassigned</Badge>;
        return <div className="flex min-w-0 items-center gap-1.5" title={names.join(' · ')}><span className="max-w-[calc(100%-3.5rem)] truncate rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{names[0]}</span>{names.length > 1 && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">+{names.length - 1}</span>}</div>;
      },
    },
    {
      key: 'account', header: 'Global account', className: 'w-[9%]', headerClassName: 'w-[9%]',
      render: (row) => <button type="button" onClick={() => toggleMentorMutation.mutate({ id: row.id, isActive: !row.isActive })} disabled={toggleMentorMutation.isPending} title={`Click to ${row.isActive ? 'deactivate' : 'activate'} globally`} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${row.isActive ? 'bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-700' : 'bg-rose-50 text-rose-700 hover:bg-emerald-50 hover:text-emerald-700'}`} aria-label={`${row.isActive ? 'Deactivate' : 'Activate'} mentor globally`}><span className={`h-1.5 w-1.5 rounded-full ${row.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />{row.isActive ? 'Deactivate' : 'Activate'}</button>,
    },
    {
      key: 'actions', header: 'Manage', className: 'w-[7%]', headerClassName: 'w-[7%]',
      render: (row) => <button type="button" onClick={() => openAssignmentEditor(row)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50"><Pencil className="h-3.5 w-3.5" />Edit</button>,
    },
  ] : [
    { key: 'name', header: 'Trainee', render: (row) => <PersonCell primary={row.name} secondary={row.email} /> },
    { key: 'employeeId', header: 'Employee ID', render: (row) => <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">{row.employeeId || '—'}</span> },
    { key: 'location', header: 'Location', render: (row) => <div><div>{row.location || '—'}</div>{row.timezone && <div className="text-xs text-slate-400">{row.timezone}</div>}</div> },
    { key: 'nominatorName', header: 'Nominated by', render: (row) => <span>{row.nominatorName || 'Platform Administrator'}</span> },
    { key: 'createdAt', header: 'Nominated on', render: (row) => formatDate(row.createdAt) },
    { key: 'allocationStatus', header: 'Cohort', render: (row) => row.cohortId ? <div className="flex max-w-sm flex-wrap gap-1">{(row.cohortNames?.length ? row.cohortNames : [row.cohortName]).filter(Boolean).map((name) => <Badge key={name} variant="active">{name}</Badge>)}</div> : <Badge variant="draft">Not in a cohort</Badge> },
    { key: 'actions', header: 'Actions', render: (row) => <button type="button" onClick={() => openAssignmentEditor(row)} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-indigo-700 hover:text-indigo-900"><Pencil className="h-3.5 w-3.5" />{row.cohortId ? 'Edit cohort' : 'Add to cohort'}</button> },
  ];

  // ---- nominator accounts ----
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [credentials, setCredentials] = useState(null); // { title, name, email, temporaryPassword }

  const createNominatorMutation = useMutation({
    mutationFn: async (payload) => (await api.post('/users/nominators', payload)).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['adminNominators'] });
      setIsCreateOpen(false);
      setCredentials({
        title: 'Nominator Created',
        name: result.nominator.name,
        email: result.nominator.email,
        temporaryPassword: result.temporaryPassword,
      });
      setNewName('');
      setNewEmployeeId('');
      setNewEmail('');
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Failed to create nominator', 'error'),
  });

  const toggleAccountMutation = useMutation({
    mutationFn: async ({ userId, isActive }) =>
      (await api.put(`/admin/users/users/${userId}/${isActive ? 'activate' : 'deactivate'}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminNominators'] });
      queryClient.invalidateQueries({ queryKey: ['nominatorsList'] });
      showToast('Nominator account updated');
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Failed to update account', 'error'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (nominator) => {
      const res = await api.post(`/admin/users/users/${nominator.id}/reset-temp-password`);
      return { nominator, data: res.data };
    },
    onSuccess: ({ nominator, data }) => {
      queryClient.invalidateQueries({ queryKey: ['adminNominators'] });
      setCredentials({
        title: 'Temporary Password Reset',
        name: nominator.name,
        email: nominator.email,
        temporaryPassword: data.tempPassword,
      });
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Failed to reset password', 'error'),
  });

  const nominatorColumns = [
    { key: 'name', header: 'Nominator', render: (row) => <button type="button" onClick={() => { setSelectedNominatorId(row.id); setDetailsTab('mentors'); }} className="text-left hover:text-emerald-700"><PersonCell primary={row.name} secondary={row.email} /></button> },
    { key: 'employeeId', header: 'Employee ID', render: (row) => <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{row.employeeId || '—'}</span> },
    { key: 'traineesNominated', header: 'Trainees nominated', render: (row) => <span className="font-semibold">{row.traineesNominated}</span> },
    { key: 'mentorsNominated', header: 'Mentors nominated', render: (row) => <span className="font-semibold">{row.mentorsNominated}</span> },
    {
      key: 'status',
      header: 'Account',
      render: (row) => (
        <Badge variant={!row.isActive || row.firstLoginPasswordReset ? 'draft' : 'active'}>
          {!row.isActive ? 'Deactivated' : row.firstLoginPasswordReset ? 'Password setup pending' : 'Active'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => resetPasswordMutation.mutate(row)}
            disabled={resetPasswordMutation.isPending}
            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900 disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" /> Reset password
          </button>
          <button
            type="button"
            aria-label={`${row.isActive ? 'Deactivate' : 'Activate'} nominator account`}
            onClick={() => toggleAccountMutation.mutate({ userId: row.id, isActive: !row.isActive })}
            disabled={toggleAccountMutation.isPending}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${row.isActive ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
          >
            {row.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  const tabs = [
    { key: 'trainees', label: 'Nominated Trainees', icon: Users },
    { key: 'mentors', label: 'Nominated Mentors', icon: Award },
    { key: 'nominators', label: `Nominators (${nominators.length})`, icon: UserCheck },
  ];

  const personLabel = kind === 'trainee' ? 'Trainee' : 'Mentor';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Nominations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Everything nominators submit lands here. Add nominees to a cohort, then assign mentors to trainees inside the cohort.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all ${
              activeTab === key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {isNomineeTab && (
        <div className="space-y-4">
          <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, employee ID or location…"
                className="w-full pl-10 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <select
              value={allocation}
              onChange={(event) => setAllocation(event.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
            >
              <option value="unallocated">Not in a cohort</option>
              <option value="allocated">Already in a cohort</option>
              <option value="all">All nominations</option>
            </select>
            <select
              value={nominatorFilter}
              onChange={(event) => setNominatorFilter(event.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
            >
              <option value="">All nominators</option>
              <option value="platform_admin">Platform Administrator</option>
              {nominators.map((nominator) => (
                <option key={nominator.id} value={nominator.id}>{nominator.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <UserPlus className="w-4 h-4 text-emerald-600" /> Add {personLabel}
            </button>
          </div>

          <DataTable
            columns={nomineeColumns}
            rows={nominees?.items || []}
            loading={nomineesLoading}
            emptyMessage={
              debouncedSearch || nominatorFilter || allocation !== 'all'
                ? `No ${kind}s match these filters.`
                : `No ${kind}s have been nominated yet.`
            }
            pagination={{ page, limit, total: nominees?.total || 0, onPageChange: setPage, onLimitChange: setLimit }}
          />
        </div>
      )}

      {activeTab === 'nominators' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Nominators only get a login. They are not tied to any cohort and cannot see cohort data.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <UserPlus className="h-4 w-4" /> Create Nominator
            </button>
          </div>
          <DataTable
            columns={nominatorColumns}
            rows={nominators}
            loading={nominatorsLoading}
            emptyMessage="No nominators yet. Create one so they can start nominating."
            pageSize={10}
          />
        </div>
      )}

      {/* Add nominee manually (admin) */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title={`Add ${personLabel}`} maxWidth="max-w-lg">
        <NomineeForm
          key={kind}
          kind={kind}
          isPending={addNomineeMutation.isPending}
          onSubmit={(payload) => addNomineeMutation.mutateAsync(payload)}
        />
      </Modal>

      {/* Edit one nominee's cohort assignment */}
      <Modal isOpen={!!editingNominee} onClose={() => setEditingNominee(null)} title={`${kind === 'mentor' ? 'Edit mentor cohorts' : 'Edit trainee cohort'} · ${editingNominee?.name || ''}`} maxWidth="max-w-lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{kind === 'mentor' ? 'Select every cohort this mentor should be assigned to. Existing assignments are preselected.' : 'Choose one cohort or clear the assignment.'}</p>
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
            {openCohorts.map((cohort) => {
              const checked = selectedCohortIds.includes(cohort.id);
              return <label key={cohort.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                <input type={kind === 'mentor' ? 'checkbox' : 'radio'} name="nominee-cohort" checked={checked} onChange={() => setSelectedCohortIds(kind === 'mentor' ? (checked ? selectedCohortIds.filter((id) => id !== cohort.id) : [...selectedCohortIds, cohort.id]) : [cohort.id])} className="h-4 w-4 accent-emerald-600" />
                <span className="text-sm font-medium text-slate-800">{cohort.name}</span><span className="ml-auto text-xs text-slate-400">{cohort.status}</span>
              </label>;
            })}
            {!openCohorts.length && cohortsData && <p className="p-3 text-sm text-slate-500">No open cohorts available.</p>}
          </div>
          {kind === 'trainee' && selectedCohortIds.length > 0 && <button type="button" onClick={() => setSelectedCohortIds([])} className="text-xs font-semibold text-rose-700">Remove cohort assignment</button>}
          {openCohorts.length === 0 && cohortsData && (
            <p className="text-xs text-amber-700">No open cohorts. Create a cohort first on the Cohorts page.</p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setEditingNominee(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button
              type="button"
              onClick={() => saveCohortMutation.mutate()}
              disabled={saveCohortMutation.isPending}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saveCohortMutation.isPending ? 'Saving…' : 'Save assignment'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!selectedNominatorId} onClose={() => setSelectedNominatorId(null)} title={`Nominator details · ${nominatorDetails?.nominator?.name || ''}`} maxWidth="max-w-5xl">
        {detailsLoading ? <p className="py-10 text-center text-sm text-slate-500">Loading nominations…</p> : <div className="space-y-4">
          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3"><div><span className="text-slate-500">Employee ID</span><p className="font-semibold">{nominatorDetails?.nominator?.employeeId || '—'}</p></div><div><span className="text-slate-500">Email</span><p className="font-semibold">{nominatorDetails?.nominator?.email || '—'}</p></div><div><span className="text-slate-500">Account</span><p className={`font-semibold ${nominatorDetails?.nominator?.isActive ? 'text-emerald-700' : 'text-rose-700'}`}>{nominatorDetails?.nominator?.isActive ? 'Active' : 'Deactivated'}</p></div></div>
          <div className="flex gap-4 border-b border-slate-200">{['mentors','trainees'].map((tab) => <button key={tab} onClick={() => setDetailsTab(tab)} className={`pb-2 text-sm font-semibold capitalize ${detailsTab === tab ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500'}`}>{tab} ({nominatorDetails?.[tab]?.length || 0})</button>)}</div>
          {(nominatorDetails?.[detailsTab] || []).length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="p-3">Name / email</th><th className="p-3">Employee ID</th><th className="p-3">Location</th><th className="p-3">Nominated</th><th className="p-3">Assignment status</th><th className="p-3">Cohort(s)</th></tr></thead><tbody className="divide-y divide-slate-100">{nominatorDetails[detailsTab].map((person) => <tr key={person.id}><td className="p-3 font-medium">{person.name}<div className="text-xs text-slate-500">{person.email}</div></td><td className="p-3">{person.employeeId || '—'}</td><td className="p-3">{person.location || '—'}</td><td className="p-3">{formatDate(person.createdAt)}</td><td className="p-3">{detailsTab === 'mentors' ? (person.assignedCohorts?.length ? 'Assigned' : 'Not assigned') : (person.cohortName ? 'Assigned' : 'Not assigned')}</td><td className="p-3">{detailsTab === 'mentors' ? (person.assignedCohorts?.join(', ') || '—') : (person.cohortName || '—')}</td></tr>)}</tbody></table></div> : <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">This nominator has not nominated any mentors or trainees yet.</p>}
        </div>}
      </Modal>

      {/* Create nominator */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Nominator" maxWidth="max-w-lg">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            createNominatorMutation.mutate({ name: newName.trim(), employeeId: newEmployeeId.trim(), email: newEmail.trim() });
          }}
        >
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-700">Name *</label>
            <input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-700">Employee ID *</label>
            <input required value={newEmployeeId} onChange={(e) => setNewEmployeeId(e.target.value)} placeholder="Employee ID" className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-700">Email *</label>
            <input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@example.com" className={inputClass} />
          </div>
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            A temporary password is generated from the name and employee ID. The nominator must change it at first sign-in.
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={createNominatorMutation.isPending} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {createNominatorMutation.isPending ? 'Creating…' : 'Create Nominator'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Temporary password (shown once) */}
      <Modal isOpen={!!credentials} onClose={() => setCredentials(null)} title={credentials?.title || ''} maxWidth="max-w-lg">
        {credentials && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{credentials.name}</p>
              <p className="text-xs text-slate-500">{credentials.email}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-emerald-800">Temporary password — shown once</label>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-800">{credentials.temporaryPassword}</code>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(credentials.temporaryPassword);
                      showToast('Temporary password copied');
                    } catch {
                      showToast('Could not copy. Select and copy it manually.', 'warning');
                    }
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Share this password securely. It will not be shown again. At first sign-in the nominator enters it as the current password and sets a new one.
            </p>
            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setCredentials(null)} className="rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-900">Done</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
