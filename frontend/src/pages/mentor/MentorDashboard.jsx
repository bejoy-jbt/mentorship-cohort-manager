import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { EmptyState } from '../../components/EmptyState';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Users } from 'lucide-react';
import { requireArrayResponse, unwrapArrayResponse } from '../../utils/arrayResponse';

const dateLabel = (value) => value ? new Date(value).toLocaleDateString() : '—';

export function MentorDashboard() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const cohortId = params.get('cohortId');
  const { data: cohortResponse = [], isLoading: cohortsLoading } = useQuery({
    queryKey: ['mentorCohorts'], queryFn: async () => requireArrayResponse((await api.get('/mentor/cohorts')).data, 'cohorts'),
  });
  const cohorts = unwrapArrayResponse(cohortResponse, 'cohorts') || [];
  const selectedCohort = cohorts.find((cohort) => cohort.id === cohortId && cohort.accessActive !== false);
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['mentorDashboard', cohortId],
    queryFn: async () => (await api.get('/mentor/dashboard', { params: { cohort_id: cohortId } })).data,
    enabled: !!cohortId && !!selectedCohort,
  });

  if (!cohortId) return <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
    <header className="mb-5 border-b border-slate-200 pb-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Mentor workspace</p><h1 className="mt-1 text-2xl font-bold text-slate-900">My Cohorts</h1><p className="mt-1 text-sm text-slate-500">{user?.name || 'Mentor'} · Select a cohort to open its trainees, plan, batches, and sessions.</p></header>
    {cohortsLoading ? <p className="py-10 text-center text-sm text-slate-500">Loading cohorts…</p> : cohorts.length ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Cohort</th><th className="px-4 py-3">Timeline</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Trainees</th><th className="px-4 py-3">Batches</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{cohorts.map((cohort) => <tr key={cohort.id} className="hover:bg-slate-50"><td className="px-4 py-3"><span className="font-semibold text-slate-900">{cohort.name}</span></td><td className="px-4 py-3 text-slate-600">{dateLabel(cohort.startDate)} – {dateLabel(cohort.endDate)}</td><td className="px-4 py-3"><span className={`font-semibold capitalize ${cohort.status === 'active' ? 'text-emerald-700' : 'text-slate-500'}`}>{cohort.status}</span></td><td className="px-4 py-3">{cohort.traineeCount}</td><td className="px-4 py-3">{cohort.batchCount}</td><td className="px-4 py-3 text-right"><Link to={`/mentor/dashboard?cohortId=${cohort.id}`} className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-900">Open workspace <ArrowRight className="h-4 w-4" /></Link></td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="No cohorts assigned" description="Cohorts assigned to your mentor account will appear here." />}
  </main>;

  if (!selectedCohort) return <main className="mx-auto max-w-7xl px-4 py-8"><EmptyState icon={Users} title="Cohort is unavailable" description="This cohort is no longer assigned to your account." action={<Link to="/mentor/dashboard" className="font-semibold text-emerald-700">Back to My Cohorts</Link>} /></main>;

  const trainees = dashboardData?.trainees || [];
  const activeCount = dashboardData?.activeTrainees ?? 0;
  const droppedCount = dashboardData?.droppedOutTrainees ?? 0;
  const averageProgress = dashboardData?.avgProgress ?? 0;
  const cohortQuery = `?cohortId=${selectedCohort.id}`;

  return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <Link to="/mentor/dashboard" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back to My Cohorts</Link>
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{selectedCohort.status}</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{selectedCohort.name}</h1><p className="mt-1 text-sm text-slate-500">{dateLabel(selectedCohort.startDate)} – {dateLabel(selectedCohort.endDate)}</p></div><nav className="flex flex-wrap gap-2 text-sm">{[['Training Plan','/mentor/plan'],['Batches','/mentor/batches'],['Sessions','/mentor/sessions']].map(([label,path]) => <Link key={path} to={`${path}${cohortQuery}`} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">{label}</Link>)}</nav></header>
    <div className="flex flex-wrap gap-6 border-b border-slate-100 py-3 text-sm"><span><b className="text-slate-900">{activeCount}</b> active trainees</span><span><b className="text-rose-700">{droppedCount}</b> dropped out</span><span><b className="text-slate-900">{averageProgress}%</b> average progress</span><span><b className="text-slate-900">{trainees.reduce((sum, t) => sum + (t.feedbackCount || 0), 0)}</b> feedback reviews</span></div>
    <section><div className="flex items-center justify-between border-b border-slate-200 py-3"><h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Trainees</h2><span className="text-xs text-slate-500">{trainees.length} records</span></div>
      {isLoading ? <p className="py-8 text-center text-sm text-slate-500">Loading trainees…</p> : trainees.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Trainee</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Feedback</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{trainees.map((trainee) => <tr key={trainee.traineeId} className="hover:bg-slate-50"><td className="px-4 py-3"><Link to={`/mentor/trainees/${trainee.traineeId}${cohortQuery}`} className="font-semibold text-slate-900 hover:text-emerald-700">{trainee.name}</Link><div className="text-xs text-slate-500">{trainee.employeeId || '—'} · {trainee.email}</div></td><td className="px-4 py-3">{trainee.location || 'Not provided'}<div className="text-xs text-slate-400">{trainee.timezone || '—'}</div></td><td className="px-4 py-3">{trainee.percentComplete}%</td><td className="px-4 py-3">{trainee.feedbackCount || 0} / {trainee.totalWeeks || 4}</td><td className={`px-4 py-3 font-semibold ${trainee.status === 'dropped_out' ? 'text-rose-700' : 'text-emerald-700'}`}>{trainee.status === 'dropped_out' ? 'Dropped out' : 'Active'}</td><td className="px-4 py-3 text-right"><Link to={`/mentor/trainees/${trainee.traineeId}${cohortQuery}`} className="font-semibold text-indigo-700">Open →</Link></td></tr>)}</tbody></table></div> : <EmptyState icon={BookOpen} title="No trainees in this cohort" description="Trainees assigned to you within this cohort will appear here." />}
    </section>
  </main>;
}
