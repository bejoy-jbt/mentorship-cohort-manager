import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/Card';
import { BackToTraineesLink } from '../../components/BackToTraineesLink';
import { Modal } from '../../components/Modal';
import { DataTable, PersonCell } from '../../components/DataTable';
import '../../styles/BatchManagement.css';

const MISSING_LOCATION = '__missing_location__';

// Table columns shared by both "choose trainees" pickers
const pickerColumns = [
  { key: 'name', header: 'Trainee', render: (trainee) => <PersonCell primary={trainee.name} secondary={trainee.email} /> },
  { key: 'employeeId', header: 'Employee ID', render: (trainee) => <span className="font-mono text-xs">{trainee.employeeId || '—'}</span> },
  { key: 'location', header: 'Location', render: (trainee) => trainee.location || 'Not provided' },
  { key: 'timezone', header: 'Time zone', render: (trainee) => <span className="text-xs text-slate-500">{trainee.timezone || '—'}</span> },
  { key: 'progress', header: 'Progress', render: (trainee) => `${Math.round(trainee.percentComplete || 0)}%` },
];

export default function BatchManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCohortId = searchParams.get('cohortId') || '';
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [cohortId, setCohortId] = useState(requestedCohortId);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceStatuses, setAttendanceStatuses] = useState({});
  const [selectedTraineeIds, setSelectedTraineeIds] = useState([]);
  const [traineeSearch, setTraineeSearch] = useState('');
  const [traineeLocationFilter, setTraineeLocationFilter] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
  });
  const [sessionFormData, setSessionFormData] = useState({
    title: '',
    sessionDate: '',
    startTime: '09:00',
    endTime: '10:00',
    format: 'online',
    location: '',
    meetingLink: '',
  });

  const {
    data: assignedTrainees = [],
    isLoading: traineesLoading,
    isError: traineesError,
  } = useQuery({
    queryKey: ['mentorAssignedTraineesForBatches', cohortId],
    queryFn: async () => {
      const res = await api.get('/mentor/trainees', { params: cohortId ? { cohort_id: cohortId } : {} });
      return res.data || [];
    },
    enabled: !!cohortId,
  });

  const { data: batchSessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['batchSessions', selectedBatch?.id],
    queryFn: async () => {
      const res = await api.get(`/sessions/?batch_id=${selectedBatch.id}&limit=100`);
      return res.data || [];
    },
    enabled: showDetailModal && !!selectedBatch?.id,
  });

  const {
    data: attendanceSession,
    isLoading: attendanceLoading,
  } = useQuery({
    queryKey: ['sessionDetails', selectedSession?.id],
    queryFn: async () => {
      const res = await api.get(`/sessions/${selectedSession.id}`);
      return res.data;
    },
    enabled: showAttendanceModal && !!selectedSession?.id,
  });

  useEffect(() => {
    if (!attendanceSession?.roster) return;
    const existingStatuses = Object.fromEntries(
      (attendanceSession.attendance || []).map((record) => [
        record.traineeId,
        record.status === 'present' ? 'present' : 'absent',
      ])
    );
    setAttendanceStatuses(Object.fromEntries(
      attendanceSession.roster.map((trainee) => [trainee.traineeId, existingStatuses[trainee.traineeId] || ''])
    ));
  }, [attendanceSession]);

  const { data: availableCohorts = [], isLoading: cohortsLoading } = useQuery({
    queryKey: ['mentorAssignedCohortsForBatches'],
    queryFn: async () => {
      const res = await api.get('/mentor/cohorts');
      return res.data || [];
    },
  });

  const {
    data: batchDetails,
    isLoading: batchDetailsLoading,
    isError: batchDetailsError,
  } = useQuery({
    queryKey: ['mentorBatchDetails', selectedBatch?.id],
    queryFn: async () => {
      const res = await api.get(`/batches/${selectedBatch.id}`);
      return res.data;
    },
    enabled: showDetailModal && !!selectedBatch?.id,
  });

  useEffect(() => {
    if (requestedCohortId && availableCohorts.some((cohort) => cohort.id === requestedCohortId)) {
      setCohortId(requestedCohortId);
    } else if (availableCohorts.length === 1) {
      setCohortId(availableCohorts[0].id);
    } else if (cohortId && !availableCohorts.some((cohort) => cohort.id === cohortId)) {
      setCohortId('');
    }
  }, [availableCohorts, cohortId, requestedCohortId]);

  const cohortTrainees = assignedTrainees.filter(
    (trainee) => String(trainee.cohortId) === String(cohortId) && trainee.status !== 'dropped_out'
  );
  const traineeLocations = [...new Set(
    cohortTrainees
      .map((trainee) => trainee.location?.trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
  const normalizedTraineeSearch = traineeSearch.trim().toLocaleLowerCase();
  const filteredCohortTrainees = cohortTrainees.filter((trainee) => {
    const matchesSearch = !normalizedTraineeSearch || [
      trainee.name,
      trainee.email,
      trainee.employeeId,
      trainee.location,
    ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedTraineeSearch));
    const matchesLocation = !traineeLocationFilter
      || (traineeLocationFilter === MISSING_LOCATION
        ? !trainee.location?.trim()
        : (trainee.location?.trim() || '') === traineeLocationFilter);
    return matchesSearch && matchesLocation;
  });
  const unbatchedCohortTrainees = cohortTrainees.filter((trainee) => !trainee.batchId);
  const filteredUnbatchedTrainees = filteredCohortTrainees.filter((trainee) => !trainee.batchId);
  const currentBatch = batchDetails || selectedBatch;
  const batchTraineeIds = new Set((batchDetails?.trainees || []).map((trainee) => trainee.traineeId));
  const addableFilteredTrainees = filteredUnbatchedTrainees.filter((trainee) => !batchTraineeIds.has(trainee.id));

  // Fetch batches
  const { data: batches, isLoading } = useQuery({
    queryKey: ['mentorBatches', cohortId],
    queryFn: async () => {
      if (!cohortId) return [];
      try {
        const params = new URLSearchParams({ cohort_id: cohortId });
        // The FastAPI router is mounted at `/batches/`. Keep the slash before
        // the query string so the browser does not need to follow a redirect
        // for this authenticated request.
        const res = await api.get(`/batches/?${params}`);
        return res.data;
      } catch (error) {
        showToast('Failed to load batches', 'error');
        return [];
      }
    },
    enabled: !!cohortId,
  });

  // Create batch mutation
  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await api.post('/batches/', {
        ...data,
        cohortId,
        traineeIds: selectedTraineeIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentorBatches'] });
      queryClient.invalidateQueries({ queryKey: ['mentorAssignedTraineesForBatches'] });
      queryClient.invalidateQueries({ queryKey: ['adminCohortSessionOverview', cohortId] });
      showToast('Batch created successfully!', 'success');
      setShowCreateModal(false);
      setFormData({
        name: '',
      });
      setSelectedTraineeIds([]);
      setTraineeSearch('');
      setTraineeLocationFilter('');
    },
    onError: (error) => {
      showToast(error.response?.data?.detail || 'Failed to create batch', 'error');
    },
  });

  const addTraineesMutation = useMutation({
    mutationFn: async ({ batchId, traineeIds }) => (
      api.post(`/batches/${batchId}/trainees`, { traineeIds })
    ),
    onSuccess: async () => {
      setSelectedTraineeIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mentorBatches'] }),
        queryClient.invalidateQueries({ queryKey: ['mentorAssignedTraineesForBatches'] }),
        queryClient.invalidateQueries({ queryKey: ['mentorBatchDetails', selectedBatch?.id] }),
        queryClient.invalidateQueries({ queryKey: ['adminCohortSessionOverview', cohortId] }),
      ]);
      showToast('Trainees added to the batch', 'success');
    },
    onError: (error) => showToast(error.response?.data?.detail || 'Failed to add trainees', 'error'),
  });

  const removeTraineeMutation = useMutation({
    mutationFn: async ({ batchId, traineeId }) => (
      api.delete(`/batches/${batchId}/trainees`, { data: { traineeIds: [traineeId] } })
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mentorBatches'] }),
        queryClient.invalidateQueries({ queryKey: ['mentorAssignedTraineesForBatches'] }),
        queryClient.invalidateQueries({ queryKey: ['mentorBatchDetails', selectedBatch?.id] }),
        queryClient.invalidateQueries({ queryKey: ['adminCohortSessionOverview', cohortId] }),
      ]);
      showToast('Trainee removed from the batch', 'success');
    },
    onError: (error) => showToast(error.response?.data?.detail || 'Failed to remove trainee', 'error'),
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId) => api.delete(`/batches/${batchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentorBatches'] });
      queryClient.invalidateQueries({ queryKey: ['adminCohortSessionOverview', cohortId] });
      setShowDetailModal(false);
      setSelectedBatch(null);
      showToast('Batch deleted', 'success');
    },
    onError: (error) => showToast(error.response?.data?.detail || 'Failed to delete batch', 'error'),
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data) => api.post('/sessions/', {
      batchId: selectedBatch.id,
      ...data,
      sessionDate: new Date(`${data.sessionDate}T${data.startTime}:00`).toISOString(),
      location: data.format === 'online' ? '' : data.location,
      meetingLink: data.format === 'in-person' ? '' : data.meetingLink,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['batchSessions', selectedBatch?.id] }),
        queryClient.invalidateQueries({ queryKey: ['adminCohortSessionOverview', cohortId] }),
      ]);
      setShowCreateSessionModal(false);
      setSessionFormData({
        title: '',
        sessionDate: '',
        startTime: '09:00',
        endTime: '10:00',
        format: 'online',
        location: '',
        meetingLink: '',
      });
      showToast('Session scheduled successfully', 'success');
    },
    onError: (error) => showToast(error.response?.data?.detail || 'Failed to schedule session', 'error'),
  });

  const markAttendanceMutation = useMutation({
    mutationFn: async () => api.post(`/sessions/${selectedSession.id}/attendance`, {
      attendanceRecords: (attendanceSession?.roster || []).map((trainee) => ({
        traineeId: trainee.traineeId,
        status: attendanceStatuses[trainee.traineeId],
      })),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['batchSessions', selectedBatch?.id] }),
        queryClient.invalidateQueries({ queryKey: ['sessionDetails', selectedSession?.id] }),
        queryClient.invalidateQueries({ queryKey: ['adminCohortSessionOverview', cohortId] }),
      ]);
      setShowAttendanceModal(false);
      setSelectedSession(null);
      showToast('Attendance saved', 'success');
    },
    onError: (error) => showToast(error.response?.data?.detail || 'Failed to save attendance', 'error'),
  });

  const handleScheduleSession = (event) => {
    event.preventDefault();
    if (!sessionFormData.title.trim() || !sessionFormData.sessionDate) {
      showToast('Session title and date are required', 'error');
      return;
    }
    if (sessionFormData.endTime <= sessionFormData.startTime) {
      showToast('End time must be later than start time', 'error');
      return;
    }
    createSessionMutation.mutate(sessionFormData);
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!formData.name) {
      showToast('Batch name is required', 'error');
      return;
    }
    if (selectedTraineeIds.length === 0) {
      showToast('Select at least one assigned trainee for this batch', 'warning');
      return;
    }
    createMutation.mutate(formData);
  };

  const handleViewBatch = (batch) => {
    setSelectedBatch(batch);
    setSelectedTraineeIds([]);
    setTraineeSearch('');
    setTraineeLocationFilter('');
    setShowDetailModal(true);
  };

  const handleDeleteBatch = () => {
    if (!selectedBatch) return;
    if (window.confirm(`Delete "${selectedBatch.name}"? This cannot be undone.`)) {
      deleteBatchMutation.mutate(selectedBatch.id);
    }
  };

  return (
    <div className="batch-management-page">
      <BackToTraineesLink cohortId={cohortId} />
      <div className="page-header">
        <h1>Batch Management</h1>
        <p>Organize trainees into groups for training</p>
      </div>

      {/* Cohort Selector */}
      <Card className="mentor-cohort-card">
        {cohortsLoading ? (
          <p className="loading-text">Loading your cohort...</p>
        ) : availableCohorts.length === 1 ? (
          <div className="mentor-selected-cohort">
            <span className="mentor-selected-cohort-label">Your Cohort</span>
            <strong>{availableCohorts[0].name}</strong>
            <span className="mentor-selected-cohort-dates">
              {availableCohorts[0].startDate || 'Start date not set'}
              {availableCohorts[0].endDate ? ` – ${availableCohorts[0].endDate}` : ''}
            </span>
          </div>
        ) : availableCohorts.length > 1 ? (
          <div className="cohort-selector">
            <label htmlFor="cohort-select">Select Cohort</label>
            <select
              id="cohort-select"
              value={cohortId}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                if (e.target.value) next.set('cohortId', e.target.value);
                else next.delete('cohortId');
                setCohortId(e.target.value);
                setSearchParams(next);
                setSelectedTraineeIds([]);
                setTraineeSearch('');
                setTraineeLocationFilter('');
              }}
            >
              <option value="">Choose a cohort...</option>
              {availableCohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>{cohort.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="empty-state">
            <p>No cohort is linked to your mentor profile yet.</p>
          </div>
        )}
      </Card>

      {cohortId && (
        <>
          {/* Controls */}
          <div className="batch-controls">
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              + Create Batch
            </button>
          </div>

          {/* Batches List */}
          {isLoading ? (
            <Card>
              <p className="loading-text">Loading batches...</p>
            </Card>
          ) : !batches || batches.length === 0 ? (
            <Card>
              <div className="empty-state">
                <p>No batches found. Create one to get started.</p>
              </div>
            </Card>
          ) : (
            <div className="overflow-x-auto border-y border-slate-200">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Trainees</th>
                    <th className="px-4 py-3">Average progress</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-slate-50/70">
                      <th scope="row" className="px-4 py-3 font-semibold text-slate-900">{batch.name}</th>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{batch.traineeCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded bg-slate-200"><div className="h-full rounded bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, Number(batch.progress) || 0))}%` }} /></div><span className="tabular-nums text-slate-700">{Math.round(batch.progress || 0)}%</span></div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{batch.startDate ? new Date(batch.startDate).toLocaleDateString() : '—'}{batch.endDate ? ` – ${new Date(batch.endDate).toLocaleDateString()}` : ''}</td>
                      <td className="px-4 py-3"><span className="font-medium capitalize text-slate-600">{batch.status || 'active'}</span></td>
                      <td className="px-4 py-3 text-right"><button className="font-semibold text-indigo-700 hover:text-indigo-900" onClick={() => handleViewBatch(batch)}>Open batch →</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Create Batch Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setFormData({ name: '' });
          setSelectedTraineeIds([]);
          setTraineeSearch('');
          setTraineeLocationFilter('');
        }}
        title="Create New Batch"
      >
        <form onSubmit={handleCreateSubmit}>
          <div className="form-group">
            <label htmlFor="batch-name">Batch Name *</label>
            <input
              id="batch-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Backend Group A"
              required
            />
          </div>

          <div className="batch-trainee-picker">
            <div className="batch-trainee-picker-header">
              <div>
                <h4>Choose Assigned Trainees *</h4>
                <p>Only trainees assigned to you in this cohort are listed.</p>
              </div>
              <span>{selectedTraineeIds.length} selected</span>
            </div>

            <div className="batch-trainee-filters">
              <label className="batch-trainee-search">
                <span>Search trainees</span>
                <input
                  type="search"
                  value={traineeSearch}
                  onChange={(event) => setTraineeSearch(event.target.value)}
                  placeholder="Name, email, employee ID, or location"
                />
              </label>
              <label className="batch-trainee-location-filter">
                <span>Filter by location</span>
                <select
                  value={traineeLocationFilter}
                  onChange={(event) => setTraineeLocationFilter(event.target.value)}
                >
                  <option value="">All locations</option>
                  {traineeLocations.map((location) => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                  {cohortTrainees.some((trainee) => !trainee.location?.trim()) && (
                    <option value={MISSING_LOCATION}>Not provided</option>
                  )}
                </select>
              </label>
            </div>

            {traineesLoading ? (
              <p className="loading-text">Loading your assigned trainees...</p>
            ) : traineesError ? (
              <p className="batch-trainee-empty">Could not load assigned trainees. Please try again.</p>
            ) : cohortTrainees.length === 0 ? (
              <p className="batch-trainee-empty">No assigned trainees in this cohort.</p>
            ) : unbatchedCohortTrainees.length === 0 ? (
              <p className="batch-trainee-empty">All assigned trainees are already in a batch.</p>
            ) : filteredUnbatchedTrainees.length === 0 ? (
              <p className="batch-trainee-empty">No trainees match these filters.</p>
            ) : (
              <DataTable
                rows={filteredUnbatchedTrainees}
                columns={pickerColumns}
                selectable
                selectedIds={selectedTraineeIds}
                onSelectionChange={setSelectedTraineeIds}
                pageSize={10}
              />
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowCreateModal(false);
                setFormData({ name: '' });
                setSelectedTraineeIds([]);
                setTraineeSearch('');
                setTraineeLocationFilter('');
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Batch'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Batch Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedBatch(null);
          setSelectedTraineeIds([]);
          setTraineeSearch('');
          setTraineeLocationFilter('');
        }}
        title={currentBatch?.name || 'Batch Details'}
      >
        {currentBatch && (
          <div className="batch-detail">
            {batchDetailsLoading ? (
              <p className="loading-text">Loading batch details...</p>
            ) : batchDetailsError || !batchDetails ? (
              <p className="batch-trainee-empty">Could not load this batch. Please close and try again.</p>
            ) : (
              <>
                <div className="detail-section">
                  <div className="batch-detail-toolbar">
                    <div>
                      <h4>Group details</h4>
                      <p><strong>Trainees:</strong> {currentBatch.traineeCount}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary batch-create-session-button"
                      onClick={() => setShowCreateSessionModal(true)}
                      disabled={!batchDetails.trainees?.length}
                      title={!batchDetails.trainees?.length ? 'Add trainees before scheduling a session' : 'Schedule a meeting for this batch'}
                    >
                      + Create Session
                    </button>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>Progress</h4>
                  <div className="progress-bar large">
                    <div className="progress-fill" style={{ width: `${currentBatch.progress}%` }}></div>
                  </div>
                  <p className="progress-text">{Math.round(currentBatch.progress)}% complete</p>
                </div>

                <div className="detail-section">
                  <div className="batch-detail-section-header">
                    <h4>Sessions ({batchSessions.length})</h4>
                  </div>
                  {sessionsLoading ? (
                    <p className="loading-text">Loading sessions...</p>
                  ) : batchSessions.length === 0 ? (
                    <p className="batch-trainee-empty">No sessions scheduled for this batch yet.</p>
                  ) : (
                    <div className="batch-sessions-list">
                      {batchSessions.map((session) => (
                        <article
                          key={session.id}
                          className="batch-session-item batch-session-item-clickable"
                          role="button"
                          tabIndex={0}
                          aria-label={`Open attendance for ${session.title}`}
                          onClick={() => {
                            setSelectedSession(session);
                            setShowAttendanceModal(true);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedSession(session);
                              setShowAttendanceModal(true);
                            }
                          }}
                        >
                          <div className="batch-session-info">
                            <strong>{session.title}</strong>
                            <span>
                              {new Date(session.sessionDate).toLocaleDateString()} · {session.startTime}–{session.endTime}
                            </span>
                            <span>
                              {session.attendanceCount}/{session.totalTrainees} marked · {session.presentCount} present
                            </span>
                            {(session.format || session.location) && (
                              <span>
                                {session.format || 'Meeting'}
                                {session.location ? ` · ${session.location}` : ''}
                              </span>
                            )}
                            {session.meetingLink && (
                              <a href={session.meetingLink} target="_blank" rel="noopener noreferrer" className="batch-session-link" onClick={(event) => event.stopPropagation()}>
                                Open meeting link
                              </a>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <div className="batch-detail-section-header">
                    <h4>Trainees ({batchDetails.trainees?.length || 0})</h4>
                  </div>
                  {batchDetails.trainees?.length ? (
                    <DataTable
                      rows={batchDetails.trainees}
                      rowKey={(trainee) => trainee.traineeId}
                      pageSize={10}
                      columns={[
                        { key: 'name', header: 'Trainee', render: (trainee) => <PersonCell primary={trainee.name} secondary={trainee.email} /> },
                        { key: 'employeeId', header: 'Employee ID', render: (trainee) => <span className="font-mono text-xs">{trainee.employeeId || '—'}</span> },
                        {
                          key: 'location',
                          header: 'Location',
                          render: (trainee) => (
                            <div>
                              <div>{trainee.location || 'Not provided'}</div>
                              {trainee.timezone && <div className="text-xs text-slate-400">{trainee.timezone}</div>}
                            </div>
                          ),
                        },
                        { key: 'progress', header: 'Progress', render: (trainee) => `${Math.round(trainee.percentComplete || 0)}%` },
                        {
                          key: 'status',
                          header: 'Status',
                          render: (trainee) => trainee.status === 'dropped_out' ? (
                            <div>
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">Dropped Out</span>
                              {trainee.dropoutReason && <p className="mt-1 text-[11px] text-rose-600">{trainee.dropoutReason}</p>}
                            </div>
                          ) : <span className="text-xs font-semibold text-emerald-700">Active</span>,
                        },
                        {
                          key: 'remove',
                          header: '',
                          render: (trainee) => (
                            <button
                              type="button"
                              className="btn-remove-trainee"
                              onClick={() => removeTraineeMutation.mutate({ batchId: currentBatch.id, traineeId: trainee.traineeId })}
                              disabled={removeTraineeMutation.isPending}
                            >
                              Remove
                            </button>
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <p className="batch-trainee-empty">No trainees are in this group yet.</p>
                  )}
                </div>

                <div className="detail-section">
                  <h4>Add assigned trainees</h4>
                  <p className="batch-trainee-help">Each trainee can belong to one batch at a time. Remove them from their current batch before moving them.</p>
                  <div className="batch-trainee-filters">
                    <label className="batch-trainee-search">
                      <span>Search trainees</span>
                      <input
                        type="search"
                        value={traineeSearch}
                        onChange={(event) => setTraineeSearch(event.target.value)}
                        placeholder="Name, email, employee ID, or location"
                      />
                    </label>
                    <label className="batch-trainee-location-filter">
                      <span>Filter by location</span>
                      <select
                        value={traineeLocationFilter}
                        onChange={(event) => setTraineeLocationFilter(event.target.value)}
                      >
                        <option value="">All locations</option>
                        {traineeLocations.map((location) => (
                          <option key={location} value={location}>{location}</option>
                        ))}
                        {cohortTrainees.some((trainee) => !trainee.location?.trim()) && (
                          <option value={MISSING_LOCATION}>Not provided</option>
                        )}
                      </select>
                    </label>
                  </div>
                  {traineesLoading ? (
                    <p className="loading-text">Loading assigned trainees...</p>
                  ) : traineesError ? (
                    <p className="batch-trainee-empty">Could not load assigned trainees. Please try again.</p>
                  ) : cohortTrainees.length === 0 ? (
                    <p className="batch-trainee-empty">No assigned trainees in this cohort.</p>
                  ) : addableFilteredTrainees.length ? (
                    <>
                      <DataTable
                        rows={addableFilteredTrainees}
                        columns={pickerColumns}
                        selectable
                        selectedIds={selectedTraineeIds}
                        onSelectionChange={setSelectedTraineeIds}
                        pageSize={10}
                      />
                      <button
                        type="button"
                        className="btn btn-primary batch-add-trainees-button"
                        disabled={!selectedTraineeIds.length || addTraineesMutation.isPending}
                        onClick={() => addTraineesMutation.mutate({
                          batchId: currentBatch.id,
                          traineeIds: selectedTraineeIds,
                        })}
                      >
                        {addTraineesMutation.isPending ? 'Adding...' : `Add selected (${selectedTraineeIds.length})`}
                      </button>
                    </>
                  ) : (
                    <p className="batch-trainee-empty">No available trainees match these filters. Trainees already belong to another batch until removed.</p>
                  )}
                </div>

                <div className="batch-detail-actions">
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleDeleteBatch}
                    disabled={deleteBatchMutation.isPending}
                    title="Delete this group if it has no training sessions"
                  >
                    {deleteBatchMutation.isPending ? 'Deleting...' : 'Delete Batch'}
                  </button>
                  <span className="batch-delete-note">Groups with training sessions are kept to preserve history.</span>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showCreateSessionModal}
        onClose={() => setShowCreateSessionModal(false)}
        title={`Schedule Session${currentBatch?.name ? ` · ${currentBatch.name}` : ''}`}
      >
        <form onSubmit={handleScheduleSession}>
          <div className="form-group">
            <label htmlFor="new-session-title">Session title *</label>
            <input
              id="new-session-title"
              type="text"
              value={sessionFormData.title}
              onChange={(event) => setSessionFormData({ ...sessionFormData, title: event.target.value })}
              placeholder="e.g. Weekly mentoring check-in"
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="new-session-date">Date *</label>
              <input
                id="new-session-date"
                type="date"
                value={sessionFormData.sessionDate}
                onChange={(event) => setSessionFormData({ ...sessionFormData, sessionDate: event.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-session-start">Start time *</label>
              <input
                id="new-session-start"
                type="time"
                value={sessionFormData.startTime}
                onChange={(event) => setSessionFormData({ ...sessionFormData, startTime: event.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-session-end">End time *</label>
              <input
                id="new-session-end"
                type="time"
                value={sessionFormData.endTime}
                onChange={(event) => setSessionFormData({ ...sessionFormData, endTime: event.target.value })}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="new-session-format">Meeting format</label>
              <select
                id="new-session-format"
                value={sessionFormData.format}
                onChange={(event) => setSessionFormData({ ...sessionFormData, format: event.target.value })}
              >
                <option value="online">Online</option>
                <option value="in-person">In person</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            {sessionFormData.format !== 'online' && (
              <div className="form-group">
                <label htmlFor="new-session-location">Location</label>
                <input
                  id="new-session-location"
                  type="text"
                  value={sessionFormData.location}
                  onChange={(event) => setSessionFormData({ ...sessionFormData, location: event.target.value })}
                  placeholder="Building or room"
                />
              </div>
            )}
            {sessionFormData.format !== 'in-person' && (
              <div className="form-group">
                <label htmlFor="new-session-link">Meeting link</label>
                <input
                  id="new-session-link"
                  type="url"
                  value={sessionFormData.meetingLink}
                  onChange={(event) => setSessionFormData({ ...sessionFormData, meetingLink: event.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreateSessionModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={createSessionMutation.isPending}>
              {createSessionMutation.isPending ? 'Scheduling...' : 'Schedule Session'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showAttendanceModal}
        onClose={() => {
          setShowAttendanceModal(false);
          setSelectedSession(null);
        }}
        title={selectedSession?.title ? `Attendance · ${selectedSession.title}` : 'Session Attendance'}
      >
        {attendanceLoading ? (
          <p className="loading-text">Loading the session roster...</p>
        ) : attendanceSession?.roster?.length ? (
          <div className="session-attendance-form">
            <p className="session-attendance-date">
              {new Date(attendanceSession.sessionDate).toLocaleDateString()} · {attendanceSession.startTime}–{attendanceSession.endTime}
            </p>
            <DataTable
              rows={attendanceSession.roster}
              rowKey={(trainee) => trainee.traineeId}
              pageSize={10}
              columns={[
                { key: 'name', header: 'Trainee', render: (trainee) => <PersonCell primary={trainee.name} secondary={trainee.email} /> },
                { key: 'location', header: 'Location', render: (trainee) => trainee.location || '—' },
                {
                  key: 'attendance',
                  header: 'Attendance',
                  render: (trainee) => (
                    <div className="attendance-choice-group" role="group" aria-label={`Attendance for ${trainee.name}`}>
                      <button
                        type="button"
                        aria-pressed={attendanceStatuses[trainee.traineeId] === 'present'}
                        className={`attendance-choice attendance-choice-present ${attendanceStatuses[trainee.traineeId] === 'present' ? 'selected' : ''}`}
                        onClick={() => setAttendanceStatuses((current) => ({ ...current, [trainee.traineeId]: 'present' }))}
                      >Present</button>
                      <button
                        type="button"
                        aria-pressed={attendanceStatuses[trainee.traineeId] === 'absent'}
                        className={`attendance-choice attendance-choice-absent ${attendanceStatuses[trainee.traineeId] === 'absent' ? 'selected' : ''}`}
                        onClick={() => setAttendanceStatuses((current) => ({ ...current, [trainee.traineeId]: 'absent' }))}
                      >Absent</button>
                    </div>
                  ),
                },
              ]}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowAttendanceModal(false);
                  setSelectedSession(null);
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  markAttendanceMutation.isPending
                  || attendanceSession.roster.some((trainee) => !attendanceStatuses[trainee.traineeId])
                }
                onClick={() => markAttendanceMutation.mutate()}
              >
                {markAttendanceMutation.isPending ? 'Saving...' : 'Save Attendance'}
              </button>
            </div>
          </div>
        ) : (
          <p className="batch-trainee-empty">Could not load the session roster.</p>
        )}
      </Modal>
    </div>
  );
}
