import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { TalentNextCourseSelector } from '../../components/TalentNextCourseSelector';
import {
  addDaysToIsoDate,
  formatDurationLabel,
  getTodayDateString,
  validateCohortDates,
} from '../../utils/cohortDates';
import { 
  PlusCircle,
  Edit3, Layers, BookOpen, MessageSquare, Plus, Trash2, 
  ChevronRight, Sparkles, AlertCircle, Check, Search
} from 'lucide-react';

export function CohortsList() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCohort, setEditingCohort] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Template and Customization States
  const [selectedTrainingTplId, setSelectedTrainingTplId] = useState('');
  const [selectedFeedbackTplId, setSelectedFeedbackTplId] = useState('');
  const [isCustomizingPlan, setIsCustomizingPlan] = useState(false);
  const [customPlan, setCustomPlan] = useState({ name: '', totalWeeks: 4, weeks: [] });
  const [isCustomizingForm, setIsCustomizingForm] = useState(false);
  const [customForm, setCustomForm] = useState({ name: '', fields: [] });
  const [selectedTalentNextCourses, setSelectedTalentNextCourses] = useState([]);

  const todayStr = getTodayDateString();
  const dateValidation = validateCohortDates(startDate, endDate, {
    requireFutureStart: !editingCohort,
  });

  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Fetch Cohorts
  const { data: cohortsData, isLoading } = useQuery({
    queryKey: ['cohorts'],
    queryFn: async () => {
      const res = await api.get('/cohorts?limit=50');
      return res.data;
    },
  });

  // Fetch Available Training Templates
  const { data: trainingTemplates } = useQuery({
    queryKey: ['trainingTemplatesList'],
    queryFn: async () => {
      const res = await api.get('/training-templates?limit=100');
      return res.data?.items || [];
    },
  });

  // Fetch Available Feedback Templates
  const { data: feedbackTemplates } = useQuery({
    queryKey: ['feedbackTemplatesList'],
    queryFn: async () => {
      const res = await api.get('/feedback-templates?limit=100');
      return res.data?.items || [];
    },
  });

  // Fetch Available TalentNext Courses
  const { data: talentnextCourses } = useQuery({
    queryKey: ['talentnextCoursesList'],
    queryFn: async () => {
      const res = await api.get('/talentnext-courses');
      return res.data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (editingCohort) {
        return await api.put(`/cohorts/${editingCohort.id}`, payload);
      } else {
        return await api.post('/cohorts', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohorts'] });
      queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
      showToast(editingCohort ? 'Cohort updated successfully' : 'Cohort created and configured successfully');
      handleCloseModal();
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to save cohort', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (cohortId) => api.delete(`/cohorts/${cohortId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohorts'] });
      queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
      showToast('Cohort and its records deleted');
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to delete cohort', 'error');
    },
  });

  // Quick helper to extend date by N weeks
  const handleOpenCreate = () => {
    setEditingCohort(null);
    setName('');
    setDescription('');
    
    // Default 4 weeks timeline using local calendar date
    const initialStart = getTodayDateString();
    const initialEnd = addDaysToIsoDate(initialStart, 28);
    setStartDate(initialStart);
    setEndDate(initialEnd);

    // Select first training template by default if available
    if (trainingTemplates && trainingTemplates.length > 0) {
      const firstTpl = trainingTemplates[0];
      setSelectedTrainingTplId(firstTpl.id);
      setCustomPlan(JSON.parse(JSON.stringify(firstTpl)));
      setSelectedTalentNextCourses(
        firstTpl.talentnextCourses ? JSON.parse(JSON.stringify(firstTpl.talentnextCourses)) : []
      );
    } else {
      setSelectedTrainingTplId('');
      setCustomPlan({ name: '', totalWeeks: 4, weeks: [] });
      setSelectedTalentNextCourses([]);
    }

    // Select first feedback template by default if available
    if (feedbackTemplates && feedbackTemplates.length > 0) {
      const firstFb = feedbackTemplates[0];
      setSelectedFeedbackTplId(firstFb.id);
      setCustomForm(JSON.parse(JSON.stringify(firstFb)));
    } else {
      setSelectedFeedbackTplId('');
      setCustomForm({ name: '', fields: [] });
    }

    setIsCustomizingPlan(false);
    setIsCustomizingForm(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (e, cohort) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingCohort(cohort);
    setName(cohort.name);
    setDescription(cohort.description || '');
    setStartDate(cohort.startDate);
    setEndDate(cohort.endDate);
    setIsCustomizingPlan(false);
    setIsCustomizingForm(false);
    setSelectedTalentNextCourses(cohort.talentnextCourses || []);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCohort(null);
  };

  // When admin picks a different training template from dropdown
  const handleSelectTrainingTemplate = (tplId) => {
    setSelectedTrainingTplId(tplId);
    if (!tplId) {
      setCustomPlan({ name: '', totalWeeks: 0, weeks: [] });
      setSelectedTalentNextCourses([]);
      return;
    }
    const tpl = trainingTemplates?.find((t) => t.id === tplId);
    if (tpl) {
      setCustomPlan(JSON.parse(JSON.stringify(tpl)));
      setSelectedTalentNextCourses(
        tpl.talentnextCourses ? JSON.parse(JSON.stringify(tpl.talentnextCourses)) : []
      );
    }
  };

  // When admin picks a different feedback template from dropdown
  const handleSelectFeedbackTemplate = (tplId) => {
    setSelectedFeedbackTplId(tplId);
    if (!tplId) {
      setCustomForm({ name: '', fields: [] });
      return;
    }
    const fb = feedbackTemplates?.find((f) => f.id === tplId);
    if (fb) {
      setCustomForm(JSON.parse(JSON.stringify(fb)));
    }
  };

  // Custom Plan Helpers
  const handleAddWeek = () => {
    const nextWeekNum = (customPlan.weeks?.length || 0) + 1;
    setCustomPlan((prev) => ({
      ...prev,
      totalWeeks: nextWeekNum,
      weeks: [
        ...(prev.weeks || []),
        {
          weekNumber: nextWeekNum,
          title: `Week ${nextWeekNum} - Deep Dive & Practice`,
          courses: [
            { title: `Module ${nextWeekNum}.1 Core Concepts`, description: '', durationHrs: 2.0 }
          ]
        }
      ]
    }));
  };

  const handleRemoveWeek = (weekIndex) => {
    setCustomPlan((prev) => {
      const filtered = prev.weeks.filter((_, idx) => idx !== weekIndex);
      // Re-number weeks
      const renumbered = filtered.map((w, idx) => ({ ...w, weekNumber: idx + 1 }));
      return {
        ...prev,
        totalWeeks: renumbered.length,
        weeks: renumbered
      };
    });
  };

  const handleAddCourseToWeek = (weekIndex) => {
    setCustomPlan((prev) => {
      const weeks = [...prev.weeks];
      const targetWeek = { ...weeks[weekIndex] };
      targetWeek.courses = [
        ...(targetWeek.courses || []),
        { title: 'New Course Module', description: '', durationHrs: 1.0 }
      ];
      weeks[weekIndex] = targetWeek;
      return { ...prev, weeks };
    });
  };

  const handleUpdateCourseInWeek = (weekIndex, courseIndex, field, value) => {
    setCustomPlan((prev) => {
      const weeks = [...prev.weeks];
      const targetWeek = { ...weeks[weekIndex] };
      const courses = [...targetWeek.courses];
      courses[courseIndex] = { ...courses[courseIndex], [field]: value };
      targetWeek.courses = courses;
      weeks[weekIndex] = targetWeek;
      return { ...prev, weeks };
    });
  };

  const handleRemoveCourseFromWeek = (weekIndex, courseIndex) => {
    setCustomPlan((prev) => {
      const weeks = [...prev.weeks];
      const targetWeek = { ...weeks[weekIndex] };
      targetWeek.courses = targetWeek.courses.filter((_, idx) => idx !== courseIndex);
      weeks[weekIndex] = targetWeek;
      return { ...prev, weeks };
    });
  };

  // Custom Form Helpers
  const handleAddField = () => {
    const nextNum = (customForm.fields?.length || 0) + 1;
    setCustomForm((prev) => ({
      ...prev,
      fields: [
        ...(prev.fields || []),
        {
          key: `field_${nextNum}`,
          label: `Evaluation Metric ${nextNum}`,
          type: 'rating',
          options: [],
          required: true
        }
      ]
    }));
  };

  const handleRemoveField = (idx) => {
    setCustomForm((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== idx)
    }));
  };

  const handleUpdateField = (idx, key, val) => {
    setCustomForm((prev) => {
      const fields = [...prev.fields];
      fields[idx] = { ...fields[idx], [key]: val };
      return { ...prev, fields };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !startDate || !endDate) {
      showToast('Please provide cohort name, start date, and end date', 'warning');
      return;
    }
    if (!dateValidation.isValid) {
      showToast(
        dateValidation.startDateError || dateValidation.endDateError || 'Please fix the cohort dates',
        'error'
      );
      return;
    }

    const payload = {
      name,
      description,
      startDate,
      endDate,
      nominatorIds: [],
      talentnextCourses: selectedTalentNextCourses,
    };

    if (!editingCohort) {
      if (isCustomizingPlan && customPlan.weeks?.length > 0) {
        payload.customTrainingPlan = {
          name: customPlan.name || `${name} Training Plan`,
          totalWeeks: customPlan.totalWeeks || customPlan.weeks.length,
          weeks: customPlan.weeks,
          talentnextCourses: customPlan.talentnextCourses || selectedTalentNextCourses
        };
      } else if (selectedTrainingTplId) {
        payload.trainingTemplateId = selectedTrainingTplId;
      }

      if (isCustomizingForm && customForm.fields?.length > 0) {
        payload.customFeedbackForm = {
          name: customForm.name || `${name} Feedback Form`,
          fields: customForm.fields
        };
      } else if (selectedFeedbackTplId) {
        payload.feedbackTemplateId = selectedFeedbackTplId;
      }
    }

    saveMutation.mutate(payload);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Mentorship Cohorts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage onboarding cohorts, track assignments, and mentor-trainee pairings
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-sm flex items-center gap-2 transition-all shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Cohort</span>
        </button>
      </div>

      {/* Cohort portfolio */}
      {isLoading ? (
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {[1, 2, 3].map((row) => <div key={row} className="h-16 animate-pulse bg-slate-50" />)}
        </div>
      ) : cohortsData?.items?.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No cohorts found"
          description="Create your first cohort to initiate track planning and nominations."
          action={
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create First Cohort</span>
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto border-y border-slate-200">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Cohort</th>
                <th className="px-4 py-3">Status / timeline</th>
                <th className="px-4 py-3">Mentors</th>
                <th className="px-4 py-3">Trainees</th>
                <th className="px-4 py-3">Assignment</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cohortsData?.items?.map((cohort) => {
                const totalTrainees = cohort.traineeCount || 0;
                const activeTrainees = cohort.activeTraineeCount ?? totalTrainees;
                const assigned = cohort.assignedTraineeCount || 0;
                const progress = Math.max(0, Math.min(100, Number(cohort.avgProgress) || 0));
                return (
                  <tr key={cohort.id} className="hover:bg-slate-50/70">
                    <th scope="row" className="px-4 py-3 font-semibold text-slate-900">
                      <Link to={`/admin/cohorts/${cohort.id}`} className="hover:text-emerald-700">{cohort.name}</Link>
                      {cohort.description && <p className="mt-0.5 max-w-sm truncate text-xs font-normal text-slate-500">{cohort.description}</p>}
                    </th>
                    <td className="px-4 py-3">
                      <span className={`font-semibold capitalize ${cohort.status === 'active' ? 'text-emerald-700' : cohort.status === 'closed' ? 'text-slate-500' : 'text-amber-700'}`}>{cohort.status}</span>
                      <p className="mt-0.5 whitespace-nowrap text-xs text-slate-500">{cohort.startDate} – {cohort.endDate}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{cohort.mentorCount || 0}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="tabular-nums">{activeTrainees}</span><span className="text-slate-500"> active / {totalTrainees}</span>
                      {!!cohort.droppedOutTraineeCount && <p className="mt-0.5 text-xs text-rose-700">{cohort.droppedOutTraineeCount} dropped out</p>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{assigned} / {activeTrainees}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded bg-slate-200"><div className="h-full rounded bg-emerald-600" style={{ width: `${progress}%` }} /></div><span className="tabular-nums text-slate-700">{progress}%</span></div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={(event) => handleOpenEdit(event, cohort)} className="mr-3 font-medium text-slate-600 hover:text-slate-900">Edit</button>
                      <Link to={`/admin/cohorts/${cohort.id}`} className="font-semibold text-emerald-700 hover:text-emerald-900">Open cohort →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCohort ? `Edit Cohort: ${editingCohort.name}` : 'Create New Cohort'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Basic Information & Timeline */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                <span>1. Cohort Profile & Timeline</span>
              </span>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  dateValidation.durationWeeks
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                    : 'text-slate-500 bg-slate-50 border-slate-200'
                }`}
              >
                Duration: {formatDurationLabel(dateValidation.durationWeeks, 'Select valid dates')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Cohort Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fall 2026 Engineering Cohort"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cohort scope, objectives, target engineering squads..."
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  min={!editingCohort ? todayStr : undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  aria-invalid={Boolean(dateValidation.startDateError)}
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 text-xs font-semibold ${
                    dateValidation.startDateError
                      ? 'border-rose-400 focus:ring-rose-500'
                      : 'border-slate-200 focus:ring-emerald-500'
                  }`}
                />
                {dateValidation.startDateError && (
                  <p className="mt-1 text-xs font-semibold text-rose-600" role="alert">
                    {dateValidation.startDateError}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  End Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate ? addDaysToIsoDate(startDate, 1) : !editingCohort ? addDaysToIsoDate(todayStr, 1) : undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  aria-invalid={Boolean(dateValidation.endDateError)}
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 text-xs font-semibold ${
                    dateValidation.endDateError
                      ? 'border-rose-400 focus:ring-rose-500'
                      : 'border-slate-200 focus:ring-emerald-500'
                  }`}
                />
                {dateValidation.endDateError && (
                  <p className="mt-1 text-xs font-semibold text-rose-600" role="alert">
                    {dateValidation.endDateError}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-600">
                Cohort Duration
              </span>
              <span
                className={`font-bold ${
                  dateValidation.durationWeeks ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                {formatDurationLabel(dateValidation.durationWeeks, 'Enter valid start and end dates')}
              </span>
            </div>


          </div>

          {/* Section 2: Training Plan Allocation (Editable) */}
          {!editingCohort && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>2. Training Plan Curriculum (Editable)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsCustomizingPlan(!isCustomizingPlan)}
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                    isCustomizingPlan
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  {isCustomizingPlan ? 'Using Custom Curriculum' : 'Customize Curriculum'}
                </button>
              </div>

              {!isCustomizingPlan ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Select Base Training Template (Deep-Copied to this Cohort)
                  </label>
                  <select
                    value={selectedTrainingTplId}
                    onChange={(e) => handleSelectTrainingTemplate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Do Not Apply Plan Yet (Configure Later) --</option>
                    {trainingTemplates?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.totalWeeks} Weeks, {t.weeks?.reduce((acc, w) => acc + (w.courses?.length || 0), 0)} courses)
                      </option>
                    ))}
                  </select>

                  {customPlan.weeks?.length > 0 && (
                    <div className="mt-2.5 p-3 rounded-xl bg-blue-50/50 border border-blue-100 text-xs text-blue-900 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-semibold">{customPlan.name}</span>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-blue-700">
                        {customPlan.totalWeeks} Weeks Allocated
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* Editable Custom Plan Builder */
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Customize Cohort Curriculum</h4>
                      <p className="text-[11px] text-slate-500">Edit titles, add courses, or extend additional weeks</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddWeek}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Week</span>
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
                    {customPlan.weeks?.map((week, wIdx) => (
                      <div key={wIdx} className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                            Week {week.weekNumber}
                          </span>
                          <input
                            type="text"
                            value={week.title}
                            onChange={(e) => {
                              const newWeeks = [...customPlan.weeks];
                              newWeeks[wIdx].title = e.target.value;
                              setCustomPlan({ ...customPlan, weeks: newWeeks });
                            }}
                            className="flex-1 px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 focus:ring-1 focus:ring-blue-500"
                            placeholder="Week title..."
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveWeek(wIdx)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Remove week"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Courses list */}
                        <div className="space-y-1.5 pl-2">
                          {week.courses?.map((c, cIdx) => (
                            <div key={cIdx} className="flex items-center gap-2 text-xs">
                              <span className="text-slate-400 text-[11px]">&bull;</span>
                              <input
                                type="text"
                                value={c.title}
                                onChange={(e) => handleUpdateCourseInWeek(wIdx, cIdx, 'title', e.target.value)}
                                placeholder="Module title..."
                                className="flex-1 px-2 py-0.5 text-xs rounded border border-slate-200 focus:ring-1 focus:ring-blue-500"
                              />
                              <div className="flex items-center gap-1 w-20">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0.5"
                                  value={c.durationHrs}
                                  onChange={(e) => handleUpdateCourseInWeek(wIdx, cIdx, 'durationHrs', parseFloat(e.target.value) || 1)}
                                  className="w-14 px-1.5 py-0.5 text-xs rounded border border-slate-200 text-right"
                                />
                                <span className="text-[10px] text-slate-400">h</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveCourseFromWeek(wIdx, cIdx)}
                                className="p-0.5 text-slate-300 hover:text-rose-500"
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleAddCourseToWeek(wIdx)}
                            className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 pt-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Course to Week {week.weekNumber}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <TalentNextCourseSelector
                catalog={talentnextCourses || []}
                assignments={selectedTalentNextCourses}
                onChange={(next) => {
                  setSelectedTalentNextCourses(next);
                  setCustomPlan((prev) => ({ ...prev, talentnextCourses: next }));
                }}
                subtitle="Selected TalentNext courses are assigned to this cohort when created."
              />
            </div>
          )}

          {/* Section 3: Feedback Form Allocation (Editable) */}
          {!editingCohort && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                  <span>3. Weekly Feedback Form (Editable)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsCustomizingForm(!isCustomizingForm)}
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                    isCustomizingForm
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  }`}
                >
                  {isCustomizingForm ? 'Using Custom Form' : 'Customize Questions'}
                </button>
              </div>

              {!isCustomizingForm ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Select Base Feedback Form Template
                  </label>
                  <select
                    value={selectedFeedbackTplId}
                    onChange={(e) => handleSelectFeedbackTemplate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- Do Not Apply Form Yet (Configure Later) --</option>
                    {feedbackTemplates?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.fields?.length || 0} questions)
                      </option>
                    ))}
                  </select>

                  {customForm.fields?.length > 0 && (
                    <div className="mt-2.5 p-3 rounded-xl bg-purple-50/50 border border-purple-100 text-xs text-purple-900 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-purple-600" />
                        <span className="font-semibold">{customForm.name}</span>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-purple-700">
                        {customForm.fields.length} Evaluation Fields
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* Editable Custom Feedback Form Builder */
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Customize Evaluation Questions</h4>
                      <p className="text-[11px] text-slate-500">Add rating questions, text areas, or select dropdowns</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddField}
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Question</span>
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {customForm.fields?.map((field, fIdx) => (
                      <div key={fIdx} className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center gap-2 text-xs">
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => handleUpdateField(fIdx, 'label', e.target.value)}
                          placeholder="Question / metric label..."
                          className="flex-1 px-2.5 py-1 text-xs rounded border border-slate-200 focus:ring-1 focus:ring-purple-500 font-semibold"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => handleUpdateField(fIdx, 'type', e.target.value)}
                          className="px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                        >
                          <option value="rating">Rating (1-5)</option>
                          <option value="text">Text Response</option>
                          <option value="select">Multiple Choice</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemoveField(fIdx)}
                          className="p-1 text-slate-300 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            {editingCohort && (
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  const confirmed = window.confirm(
                    `Delete “${editingCohort.name}”? This permanently removes its nominations, mentor and trainee records, batches, sessions, attendance, progress, feedback, and cohort-specific plans.`
                  );
                  if (confirmed) deleteMutation.mutate(editingCohort.id, {
                    onSuccess: handleCloseModal,
                  });
                }}
                className="mr-auto rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete Cohort'}
              </button>
            )}
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending || !dateValidation.isValid}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{saveMutation.isPending ? 'Saving...' : editingCohort ? 'Update & Extend Cohort' : 'Create & Launch Cohort'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
