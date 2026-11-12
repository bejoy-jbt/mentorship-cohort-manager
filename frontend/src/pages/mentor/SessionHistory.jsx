import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Clock3, MapPin, Video, Users, ChevronDown } from 'lucide-react';
import api from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable, PersonCell } from '../../components/DataTable';
import { useToast } from '../../context/ToastContext';
import { requireArrayResponse, unwrapArrayResponse } from '../../utils/arrayResponse';

const statusStyles = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

const statusBadgeClass = {
  scheduled: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-rose-50 text-rose-700',
};

function formatDate(value) {
  if (!value) return 'Date not set';
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateShort(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SessionHistory() {
  const [params, setParams] = useSearchParams();
  const cohortId = params.get('cohortId');
  const { data: cohortResponse = [] } = useQuery({
    queryKey: ['mentorCohorts'], queryFn: async () => requireArrayResponse((await api.get('/mentor/cohorts')).data, 'cohorts'),
  });
  const cohorts = unwrapArrayResponse(cohortResponse, 'cohorts') || [];
  const selectedCohort = cohorts.find((cohort) => cohort.id === cohortId);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [attendanceStatuses, setAttendanceStatuses] = useState({});

  const { data: sessions = [], isLoading, isError } = useQuery({
    queryKey: ['mentorSessionHistory', cohortId],
    queryFn: async () => {
      const response = await api.get('/sessions/', { params: { limit: 100, ...(cohortId ? { cohort_id: cohortId } : {}) } });
      return requireArrayResponse(response.data, 'sessions');
    },
  });

  const { data: sessionDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['mentorSessionHistoryDetails', expandedSessionId],
    queryFn: async () => {
      const response = await api.get(`/sessions/${expandedSessionId}`);
      return response.data;
    },
    enabled: !!expandedSessionId,
  });

  useEffect(() => {
    if (!sessionDetails?.roster) return;
    const existingStatuses = Object.fromEntries(
      (sessionDetails.attendance || []).map((record) => [
        record.traineeId,
        record.status === 'present' ? 'present' : 'absent',
      ])
    );
    setAttendanceStatuses(Object.fromEntries(
      sessionDetails.roster.map((trainee) => [trainee.traineeId, existingStatuses[trainee.traineeId] || ''])
    ));
  }, [sessionDetails]);

  const attendanceMutation = useMutation({
    mutationFn: () => api.post(`/sessions/${expandedSessionId}/attendance`, {
      attendanceRecords: (sessionDetails?.roster || []).map((trainee) => ({
        traineeId: trainee.traineeId,
        status: attendanceStatuses[trainee.traineeId],
      })),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mentorSessionHistory'] }),
        queryClient.invalidateQueries({ queryKey: ['mentorSessionHistoryDetails', expandedSessionId] }),
        queryClient.invalidateQueries({ queryKey: ['batchSessions'] }),
      ]);
      showToast('Attendance saved', 'success');
    },
    onError: (error) => showToast(error.response?.data?.detail || 'Could not save attendance', 'error'),
  });

  const filteredSessions = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));
    return statusFilter === 'all' ? sorted : sorted.filter((session) => session.status === statusFilter);
  }, [sessions, statusFilter]);

  const scheduledCount = sessions.filter((session) => session.status === 'scheduled').length;
  const completedCount = sessions.filter((session) => session.status === 'completed').length;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">

      {/* ── Page header ── */}
      <Link
        to={cohortId ? `/mentor/dashboard?cohortId=${encodeURIComponent(cohortId)}` : '/mentor/dashboard'}
        className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to trainees
      </Link>
      <div className="flex items-center justify-between py-2 border-b border-slate-200 mb-0">
        <div><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Session History</span>{selectedCohort && <p className="mt-0.5 text-xs text-slate-400">{selectedCohort.name}</p>}</div>
        <p className="text-[11px] text-slate-400">Review scheduled and completed sessions across your batches.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-2.5">
        <label htmlFor="session-history-cohort" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cohort</label>
        <select
          id="session-history-cohort"
          value={cohortId || 'all'}
          onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value === 'all') next.delete('cohortId');
            else next.set('cohortId', event.target.value);
            setParams(next);
          }}
          className="min-w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        >
          <option value="all">All my cohorts</option>
          {cohorts.filter((cohort) => cohort.accessActive !== false).map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
        </select>
      </div>

      {/* ── Stats strip ── */}
      <div className="flex gap-8 py-2.5 border-b border-slate-100 text-sm flex-wrap items-center">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1.5">Scheduled</span>
          <span className="font-bold text-blue-700">{scheduledCount}</span>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1.5">Completed</span>
          <span className="font-bold text-emerald-700">{completedCount}</span>
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1.5">Total</span>
          <span className="font-bold text-slate-800">{sessions.length}</span>
        </div>
        {/* Status filter inline */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-500"
          >
            <option value="all">All</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <span className="text-[11px] text-slate-400">{filteredSessions.length} shown</span>
        </div>
      </div>

      {/* ── Sessions table ── */}
      <section>
        <div className="flex items-center justify-between py-2 border-b border-slate-200 mb-0">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Sessions</span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-100 border-b border-slate-200">
            {[1, 2, 3].map((row) => <div key={row} className="h-10 animate-pulse bg-slate-50" />)}
          </div>
        ) : isError ? (
          <div className="py-4 px-4 text-xs text-rose-600">Could not load session history. Please try again.</div>
        ) : filteredSessions.length === 0 ? (
          <div className="py-8 text-center">
            <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-500">No sessions found</p>
            <p className="text-[11px] text-slate-400 mt-1">Sessions you schedule in your batches will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border-b border-slate-200">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Batch</th>
                  <th className="px-4 py-2">Format</th>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Attendance</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSessions.map((session) => (
                  <tr
                    key={session.id}
                    className="hover:bg-slate-50/70 cursor-pointer"
                    onClick={() => setExpandedSessionId(session.id)}
                  >
                    <td className="px-4 py-2 tabular-nums text-slate-600 text-xs whitespace-nowrap">
                      {formatDateShort(session.sessionDate)}
                    </td>
                    <td className="px-4 py-2 font-semibold text-slate-800">{session.title}</td>
                    <td className="px-4 py-2 text-slate-600 text-xs">{session.batchName || '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-500 capitalize">
                      {session.format === 'in-person' && session.location ? (
                        <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{session.location}</span>
                      ) : session.format === 'online' && session.meetingLink ? (
                        <a
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                          href={session.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Video className="w-3 h-3" />Online
                        </a>
                      ) : (
                        <span>{session.format || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-slate-500 text-xs whitespace-nowrap">
                      {session.startTime}–{session.endTime}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-slate-600 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-400" />
                        {session.presentCount}/{session.totalTrainees}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusBadgeClass[session.status] || 'bg-slate-100 text-slate-600'}`}>
                        {(session.status || 'unknown').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                        onClick={() => setExpandedSessionId(session.id)}
                      >
                        Attendance →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Attendance Modal (kept exactly as-is) ── */}
      <Modal
        isOpen={!!expandedSessionId}
        onClose={() => setExpandedSessionId(null)}
        title={sessionDetails?.title ? `Session · ${sessionDetails.title}` : 'Session Attendance'}
      >
        {detailsLoading ? (
          <p className="text-sm text-slate-500">Loading the session roster…</p>
        ) : sessionDetails?.roster?.length ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">{sessionDetails.batchName}</p>
              <p>{formatDate(sessionDetails.sessionDate)} · {sessionDetails.startTime}–{sessionDetails.endTime}</p>
            </div>
            <DataTable
              rows={sessionDetails.roster}
              rowKey={(trainee) => trainee.traineeId}
              pageSize={10}
              columns={[
                { key: 'name', header: 'Trainee', render: (trainee) => <PersonCell primary={trainee.name} secondary={trainee.email} /> },
                { key: 'location', header: 'Location', render: (trainee) => trainee.location || '—' },
                {
                  key: 'attendance',
                  header: 'Attendance',
                  render: (trainee) => (
                    <div className="flex shrink-0 gap-2" role="group" aria-label={`Attendance for ${trainee.name}`}>
                      <button
                        type="button"
                        aria-pressed={attendanceStatuses[trainee.traineeId] === 'present'}
                        onClick={() => setAttendanceStatuses((current) => ({ ...current, [trainee.traineeId]: 'present' }))}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${attendanceStatuses[trainee.traineeId] === 'present' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                      >Present</button>
                      <button
                        type="button"
                        aria-pressed={attendanceStatuses[trainee.traineeId] === 'absent'}
                        onClick={() => setAttendanceStatuses((current) => ({ ...current, [trainee.traineeId]: 'absent' }))}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${attendanceStatuses[trainee.traineeId] === 'absent' ? 'border-rose-600 bg-rose-600 text-white' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                      >Absent</button>
                    </div>
                  ),
                },
              ]}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setExpandedSessionId(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">Close</button>
              <button
                type="button"
                disabled={attendanceMutation.isPending || sessionDetails.roster.some((trainee) => !attendanceStatuses[trainee.traineeId])}
                onClick={() => attendanceMutation.mutate()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {attendanceMutation.isPending ? 'Saving…' : 'Save Attendance'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Could not load this session's trainee list.</p>
        )}
      </Modal>
    </main>
  );
}
