import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { CardTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { ProgressBar } from '../../components/ProgressBar';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { DataTable, PersonCell } from '../../components/DataTable';
import { AllocateNomineesModal } from '../../components/AllocateNomineesModal';
import { 
  ArrowLeft, Calendar, Award, Users, Settings, UserPlus, 
  KeyRound, CheckCircle2, Lock, Sparkles, BookOpen, Check,
  ChevronDown, ChevronUp, Edit3, Clock, Plus, Trash2, AlertCircle,
  UserCheck, ShieldCheck, Search, Filter, X, Eye, MessageSquare,
  ClipboardList, ChevronRight, Star, ExternalLink, Mail, Copy
} from 'lucide-react';

// The API returns at most 100 rows per page, so walk every page. A cohort or a
// mentor can easily have more than 100 people.
async function fetchAllPages(path) {
  let page = 1;
  let pages = 1;
  let items = [];
  let total = 0;
  do {
    const res = await api.get(path, { params: { limit: 100, page } });
    items = items.concat(res.data.items || []);
    total = res.data.total ?? items.length;
    pages = res.data.pages || 1;
    page += 1;
  } while (page <= pages);
  return { items, total };
}

export function CohortDetail() {
  const { id: cohortId } = useParams();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'nominations' | 'assignments' | 'talentnext' | 'config'
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Search & Filter state for Nominees tab
  const [searchTerm, setSearchTerm] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('ALL');
  const [assignmentTraineeSearch, setAssignmentTraineeSearch] = useState('');
  const [assignmentMentorSearch, setAssignmentMentorSearch] = useState('');
  const [assignmentMentorFilter, setAssignmentMentorFilter] = useState('ALL');

  // Modals
  const [isAllocateMentorsOpen, setIsAllocateMentorsOpen] = useState(false);
  const [isAllocateTraineesOpen, setIsAllocateTraineesOpen] = useState(false);
  const [mentorTemporaryCredentials, setMentorTemporaryCredentials] = useState(null);
  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);
  const [selectedMentorDetails, setSelectedMentorDetails] = useState(null);
  const [targetMentor, setTargetMentor] = useState(null);
  const [selectedNominatorDetails, setSelectedNominatorDetails] = useState(null);

  // Edit Cohort & Timeline States
  const [isEditTimelineOpen, setIsEditTimelineOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Extend Weeks & Plan Editor States
  const [isExtendWeeksOpen, setIsExtendWeeksOpen] = useState(false);
  const [additionalWeeksCount, setAdditionalWeeksCount] = useState(1);
  const [newEndDateExtend, setNewEndDateExtend] = useState('');
  const [isEditPlanOpen, setIsEditPlanOpen] = useState(false);
  const [editablePlanName, setEditablePlanName] = useState('');
  const [editablePlanWeeks, setEditablePlanWeeks] = useState([]);

  // Edit Live Feedback Form States
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [editableFormFields, setEditableFormFields] = useState([]);

  // Trainee Feedback Review Modal for Admin
  const [selectedTraineeForFeedback, setSelectedTraineeForFeedback] = useState(null);
  const [isTraineeFeedbackModalOpen, setIsTraineeFeedbackModalOpen] = useState(false);
  const [expandedTalentNext, setExpandedTalentNext] = useState(true); // TalentNext section expanded by default

  // Form states for adding nominee records

  // Expanded mentor card state
  const [expandedMentorId, setExpandedMentorId] = useState(null);
  const [mentorTraineesCache, setMentorTraineesCache] = useState({});
  const [loadingMentorTrainees, setLoadingMentorTrainees] = useState(null);

  // Config tab states
  const [selectedTrainingTplId, setSelectedTrainingTplId] = useState('');
  const [selectedFeedbackTplId, setSelectedFeedbackTplId] = useState('');

  // TalentNext modal and search states
  const [isTalentNextModalOpen, setIsTalentNextModalOpen] = useState(false);
  const [talentNextSearch, setTalentNextSearch] = useState('');
  const [talentNextCourses, setTalentNextCourses] = useState([]);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [selectedCourseMandatory, setSelectedCourseMandatory] = useState(false);

  // Fetch TalentNext Courses
  const { data: availableTalentNextCourses } = useQuery({
    queryKey: ['talentnextCoursesList'],
    queryFn: async () => {
      try {
        const res = await api.get('/talentnext-courses');
        return res.data || [];
      } catch {
        return [];
      }
    },
  });

  // Fetch course details to map IDs to names
  const { data: allTalentNextCourses } = useQuery({
    queryKey: ['allTalentNextCoursesForMapping'],
    queryFn: async () => {
      try {
        const res = await api.get('/talentnext-courses');
        return res.data || [];
      } catch {
        return [];
      }
    },
  });

  // Create a mapping of course ID to course name
  const courseNameMap = {};
  allTalentNextCourses?.forEach(course => {
    courseNameMap[course.id] = course.name;
  });

  // Update component to use fetched courses
  React.useEffect(() => {
    setTalentNextCourses(availableTalentNextCourses || []);
  }, [availableTalentNextCourses]);
  const { data: cohort, isLoading: cohortLoading } = useQuery({
    queryKey: ['cohort', cohortId],
    queryFn: async () => {
      const res = await api.get(`/cohorts/${cohortId}`);
      return res.data;
    },
  });

  const { data: cohortNominators = [], isLoading: cohortNominatorsLoading } = useQuery({
    queryKey: ['adminNominators'],
    queryFn: async () => {
      const res = await api.get('/users/nominators');
      return res.data || [];
    },
    enabled: activeTab === 'nominations',
  });

  const { data: nominatorSubmissions, isLoading: nominatorSubmissionsLoading } = useQuery({
    queryKey: ['nominatorSubmissions', selectedNominatorDetails?.id],
    queryFn: async () => {
      const res = await api.get(`/nominations/by-nominator/${selectedNominatorDetails.id}`);
      return res.data;
    },
    enabled: activeTab === 'nominations' && !!selectedNominatorDetails?.id,
  });

  // 2. Fetch Mentors
  const { data: mentorsData, isLoading: mentorsLoading } = useQuery({
    queryKey: ['cohortMentors', cohortId],
    queryFn: async () => {
      return await fetchAllPages(`/cohorts/${cohortId}/mentors`);
    },
  });

  const { data: cohortSessionOverview = [], isLoading: cohortSessionOverviewLoading } = useQuery({
    queryKey: ['adminCohortSessionOverview', cohortId],
    queryFn: async () => {
      const res = await api.get(`/sessions/cohort/${cohortId}/overview`);
      return res.data || [];
    },
    enabled: activeTab === 'nominations' && !!cohortId,
  });

  // 3. Fetch Trainees
  const { data: traineesData, isLoading: traineesLoading } = useQuery({
    queryKey: ['cohortTrainees', cohortId],
    queryFn: async () => {
      return await fetchAllPages(`/cohorts/${cohortId}/trainees`);
    },
  });

  // 4. Fetch Templates for Config Tab
  const { data: trainingTemplates } = useQuery({
    queryKey: ['trainingTemplatesList'],
    queryFn: async () => {
      const res = await api.get('/training-templates?limit=100');
      return res.data?.items || [];
    },
  });

  const { data: feedbackTemplates } = useQuery({
    queryKey: ['feedbackTemplatesList'],
    queryFn: async () => {
      const res = await api.get('/feedback-templates?limit=100');
      return res.data?.items || [];
    },
  });

  // Fetch configured plan & form if available
  const { data: activePlan } = useQuery({
    queryKey: ['cohortPlan', cohortId, cohort?.trainingPlanId],
    queryFn: async () => {
      if (!cohort?.trainingPlanId) return null;
      const res = await api.get(`/cohorts/${cohortId}/plan`);
      return res.data;
    },
    enabled: !!cohort?.trainingPlanId,
  });

  const { data: activeForm } = useQuery({
    queryKey: ['cohortForm', cohortId, cohort?.feedbackFormId],
    queryFn: async () => {
      if (!cohort?.feedbackFormId) return null;
      const res = await api.get(`/cohorts/${cohortId}/feedback-form`);
      return res.data;
    },
    enabled: !!cohort?.feedbackFormId,
  });

  const { data: traineeFeedbackDetail, isLoading: traineeFeedbackLoading } = useQuery({
    queryKey: ['adminTraineeFeedback', selectedTraineeForFeedback?.id],
    queryFn: async () => {
      if (!selectedTraineeForFeedback?.id) return null;
      const res = await api.get(`/mentor/trainees/${selectedTraineeForFeedback.id}`);
      return res.data;
    },
    enabled: isTraineeFeedbackModalOpen && !!selectedTraineeForFeedback?.id,
  });

  // Mutations
  const statusMutation = useMutation({
    mutationFn: async (newStatus) => {
      const res = await api.patch(`/cohorts/${cohortId}/status`, { status: newStatus });
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['cohort', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohorts'] });
      showToast(`Cohort status changed to ${updated.status}`);
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to update status', 'error');
    },
  });

  const configureMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/cohorts/${cohortId}/configure`, {
        trainingTemplateId: selectedTrainingTplId,
        feedbackTemplateId: selectedFeedbackTplId,
        force: true,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohort', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohortPlan', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohortForm', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohortTrainees', cohortId] });
      showToast('Templates copied and configured for this cohort!');
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to configure templates', 'error');
    },
  });

  const updateCohortMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.put(`/cohorts/${cohortId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohort', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohorts'] });
      showToast('Cohort timeline and details updated successfully!');
      setIsEditTimelineOpen(false);
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to update cohort', 'error');
    },
  });

  const createTalentNextCourseMutation = useMutation({
    mutationFn: async (courseName) => {
      const res = await api.post('/talentnext-courses', { name: courseName });
      return res.data;
    },
    onSuccess: (newCourse) => {
      queryClient.invalidateQueries({ queryKey: ['talentnextCoursesList'] });
      queryClient.invalidateQueries({ queryKey: ['allTalentNextCoursesForMapping'] });
      showToast(`Course "${newCourse.name}" created successfully!`);
      setIsCreateCourseModalOpen(false);
      setNewCourseName('');
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to create course', 'error');
    },
  });

  const extendWeeksMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post(`/cohorts/${cohortId}/extend-timeline`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohort', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohortPlan', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohortTrainees', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['mentorCohortPlan'] });
      queryClient.invalidateQueries({ queryKey: ['cohorts'] });
      showToast('Cohort timeline and curriculum weeks extended successfully!');
      setIsExtendWeeksOpen(false);
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to extend weeks', 'error');
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.put(`/cohorts/${cohortId}/plan`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohort', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohortPlan', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohortTrainees', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['mentorCohortPlan'] });
      queryClient.invalidateQueries({ queryKey: ['cohorts'] });
      showToast('Training plan curriculum & weeks updated successfully!');
      setIsEditPlanOpen(false);
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to update training plan', 'error');
    },
  });

  const updateFormMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.put(`/cohorts/${cohortId}/feedback-form`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohort', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohortForm', cohortId] });
      showToast('Cohort feedback questionnaire updated successfully!');
      setIsEditFormOpen(false);
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to update feedback form', 'error');
    },
  });

  const activateLoginMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/mentors/${targetMentor.id}/activate-login`);
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cohortMentors', cohortId] });
      setMentorTemporaryCredentials({
        name: targetMentor.name,
        email: targetMentor.email,
        password: result.temporaryPassword,
      });
      showToast(`Login activated for mentor ${targetMentor.name}. Share the temporary password securely.`);
      setIsActivateModalOpen(false);
      setTargetMentor(null);
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to activate login', 'error');
    },
  });

  const resetMentorPasswordMutation = useMutation({
    mutationFn: async (userId) => {
      const response = await api.post(`/admin/users/users/${userId}/reset-temp-password`);
      return response.data;
    },
    onSuccess: (result) => {
      const mentor = selectedMentorDetails;
      setMentorTemporaryCredentials({
        name: mentor?.name || 'Mentor',
        email: mentor?.email || '',
        password: result.tempPassword,
      });
      setSelectedMentorDetails((current) => current ? { ...current, firstLoginPasswordReset: true } : current);
      queryClient.invalidateQueries({ queryKey: ['cohortMentors', cohortId] });
      showToast('Temporary password generated. Share it securely with the mentor.');
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Failed to reset mentor password', 'error'),
  });

  const toggleAccountMutation = useMutation({
    mutationFn: async ({ mentorId, isActive }) => {
      const response = await api.put(`/nominations/mentors/${mentorId}/cohort-access`, { cohortId, isActive });
      return response.data;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cohortMentors', cohortId] });
      showToast(`Mentor cohort access ${variables.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Failed to update cohort access', 'error'),
  });

  const toggleNominatorMutation = useMutation({
    mutationFn: async ({ userId, isActive }) => {
      const action = isActive ? 'activate' : 'deactivate';
      const response = await api.put(`/admin/users/users/${userId}/${action}`);
      return response.data;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminNominators'] });
      queryClient.invalidateQueries({ queryKey: ['nominatorsList'] });
      setSelectedNominatorDetails((current) => current ? { ...current, isActive: variables.isActive } : current);
      showToast(`Nominator account ${variables.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (err) => showToast(err.response?.data?.detail || 'Failed to update nominator account', 'error'),
  });

  const assignMentorMutation = useMutation({
    mutationFn: async ({ traineeId, mentorId }) => {
      return await api.put(`/trainees/${traineeId}/mentor`, { mentorId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohortTrainees', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohortMentors', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohort', cohortId] });
      showToast('Trainee assigned to mentor!');
    },
    onError: (err) => {
      showToast(err.response?.data?.detail || 'Failed to assign mentor', 'error');
    },
  });

  // Handler: Toggle expanded mentor card & fetch their trainees
  const handleMentorExpand = async (mentorId) => {
    if (expandedMentorId === mentorId) {
      setExpandedMentorId(null);
      return;
    }
    setExpandedMentorId(mentorId);
    // Only fetch if not already cached
    if (!mentorTraineesCache[mentorId]) {
      setLoadingMentorTrainees(mentorId);
      try {
        const res = await api.get(`/cohorts/${cohortId}/mentors/${mentorId}/trainees`);
        setMentorTraineesCache((prev) => ({ ...prev, [mentorId]: res.data }));
      } catch (err) {
        setMentorTraineesCache((prev) => ({ ...prev, [mentorId]: [] }));
      } finally {
        setLoadingMentorTrainees(null);
      }
    }
  };

  if (cohortLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 bg-slate-200 rounded w-32 animate-pulse" />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {[1, 2, 3].map((row) => <div key={row} className="h-14 animate-pulse bg-slate-50" />)}
        </div>
      </div>
    );
  }

  if (!cohort) {
    return (
      <EmptyState
        title="Cohort not found"
        description="The requested cohort does not exist or has been removed."
        action={
          <Link to="/admin/cohorts" className="text-xs font-bold text-emerald-600">
            &larr; Back to Cohorts
          </Link>
        }
      />
    );
  }

  const isLocked = cohort.status === 'closed';
  const selectedTrainingTpl = trainingTemplates?.find((t) => t.id === selectedTrainingTplId);
  const selectedFeedbackTpl = feedbackTemplates?.find((t) => t.id === selectedFeedbackTplId);

  // Filtered mentors list matching mentor name, employeeId, email, department, nominator OR assigned trainee name/empId/dept
  const filteredMentors = (mentorsData?.items || []).filter((mentor) => {
    const q = searchTerm.toLowerCase().trim();
    const assigned = mentor.assignedTrainees || [];

    const matchesMentorName = mentor.name?.toLowerCase().includes(q);
    const matchesMentorEmail = mentor.email?.toLowerCase().includes(q);
    const matchesMentorEmpId = mentor.employeeId?.toLowerCase().includes(q);
    const matchesMentorDept = mentor.department?.toLowerCase().includes(q);
    const matchesNominator = mentor.nominatorName?.toLowerCase().includes(q);

    const matchesAnyTrainee = assigned.some((t) => 
      t.name?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.employeeId?.toLowerCase().includes(q) ||
      t.department?.toLowerCase().includes(q)
    );

    const matchesSearch = !q || matchesMentorName || matchesMentorEmail || matchesMentorEmpId || matchesMentorDept || matchesNominator || matchesAnyTrainee;
    let matchesAssign = true;
    if (assignmentFilter === 'ASSIGNED') {
      matchesAssign = assigned.length > 0;
    } else if (assignmentFilter === 'UNASSIGNED') {
      matchesAssign = assigned.length === 0;
    }

    return matchesSearch && matchesAssign;
  });

  const assignmentMentors = mentorsData?.items || [];
  const mentorOptionsForAssignment = assignmentMentors.filter((mentor) => {
    const query = assignmentMentorSearch.trim().toLowerCase();
    return !query || [mentor.name, mentor.employeeId, mentor.email]
      .some((value) => value?.toLowerCase().includes(query));
  });
  const filteredAssignmentTrainees = (traineesData?.items || []).filter((trainee) => {
    const query = assignmentTraineeSearch.trim().toLowerCase();
    const matchesTrainee = !query || [trainee.name, trainee.employeeId, trainee.email, trainee.location, trainee.department]
      .some((value) => value?.toLowerCase().includes(query));
    const matchesMentor = assignmentMentorFilter === 'ALL'
      || (assignmentMentorFilter === 'UNASSIGNED' && !trainee.mentorId)
      || String(trainee.mentorId || '') === assignmentMentorFilter;
    return matchesTrainee && matchesMentor;
  });

  return (
    <div className="space-y-8">
      {/* Back button & Breadcrumb */}
      <div>
        <Link
          to="/admin/cohorts"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Cohorts</span>
        </Link>

        {/* Cohort Header Card */}
        <section className="border-b border-slate-200 pb-5">
          <div className="px-0 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">{cohort.name}</h1>
                  <Badge variant={cohort.status} size="md">{cohort.status}</Badge>
                </div>
                <p className="text-sm text-slate-500 max-w-2xl">{cohort.description || 'No description provided.'}</p>
                <div className="flex items-center gap-4 mt-3 text-xs font-semibold text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>{mentorsData?.total || 0} Mentors</span>
                  </div>
                  <div>&bull;</div>
                  <div className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-slate-400" />
                    <span>{traineesData?.total || 0} Trainees</span>
                  </div>
                  <div>&bull;</div>
                  <div>Managed by Administrator</div>
                </div>
              </div>

              {/* Status & Timeline Controls */}
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                {cohort.status === 'draft' && (
                  <button
                    onClick={() => statusMutation.mutate('active')}
                    disabled={statusMutation.isPending}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Activate Cohort</span>
                  </button>
                )}
                {cohort.status === 'active' && (
                  <button
                    onClick={() => statusMutation.mutate('closed')}
                    disabled={statusMutation.isPending}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-all"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Close Cohort</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        {[
          { key: 'overview', label: 'Overview', icon: BookOpen },
          { key: 'nominations', label: `Mentor Details`, icon: Users },
          { key: 'assignments', label: `Assign Mentors (${cohort.assignedTraineeCount || 0}/${cohort.traineeCount || 0})`, icon: Award },
          { key: 'talentnext', label: `TalentNext (${cohort?.talentnextCourses?.length || 0})`, icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
                isSelected
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-slate-200 py-4 sm:grid-cols-3 lg:grid-cols-5">
            <div><p className="text-xs font-medium text-slate-500">Mentors</p><p className="mt-1 text-xl font-semibold text-slate-900">{cohort.mentorCount || 0}</p></div>
            <div><p className="text-xs font-medium text-slate-500">Active trainees</p><p className="mt-1 text-xl font-semibold text-slate-900">{cohort.activeTraineeCount ?? cohort.traineeCount ?? 0}<span className="ml-1 text-xs font-normal text-slate-500">/ {cohort.traineeCount || 0}</span></p></div>
            <div><p className="text-xs font-medium text-slate-500">Dropped out</p><p className="mt-1 text-xl font-semibold text-rose-700">{cohort.droppedOutTraineeCount || 0}</p></div>
            <div><p className="text-xs font-medium text-slate-500">Mentor assigned</p><p className="mt-1 text-xl font-semibold text-slate-900">{cohort.assignedTraineeCount || 0}<span className="ml-1 text-xs font-normal text-slate-500">/ {cohort.activeTraineeCount ?? cohort.traineeCount ?? 0}</span></p></div>
            <div><p className="text-xs font-medium text-slate-500">Average completion</p><p className="mt-1 text-xl font-semibold text-emerald-700">{cohort.avgProgress || 0}%</p></div>
          </div>

          {/* Configured Templates Preview Card */}
          <div className="grid grid-cols-1 gap-8 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
            <section className="min-w-0 pb-7 md:pb-0 md:pr-8">
              <div className="mb-4 border-b border-slate-200 pb-3">
                <div className="flex items-center justify-between w-full">
                  <CardTitle subtitle="Independent snapshot created for this cohort">
                    Applied Training Plan
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {activePlan && (activePlan.bufferWeeks > 0 || activePlan.weeks?.some(w => w.isBuffer || !w.courses?.length)) ? (
                      <div className="flex items-center gap-1 text-[11px] font-bold">
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg">
                          {activePlan.coreWeeks ?? activePlan.weeks?.filter(w => !w.isBuffer && w.courses?.length > 0).length} Core
                        </span>
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-lg">
                          +{activePlan.bufferWeeks ?? activePlan.weeks?.filter(w => w.isBuffer || !w.courses?.length).length} Buffer
                        </span>
                      </div>
                    ) : (
                      <Badge variant={activePlan ? 'active' : 'draft'}>
                        {activePlan ? `${activePlan.totalWeeks} Weeks` : 'Not Set'}
                      </Badge>
                    )}
                    {activePlan && (
                      <>
                        <button
                          onClick={() => {
                            setEditablePlanName(activePlan.name || '');
                            setEditablePlanWeeks(JSON.parse(JSON.stringify(activePlan.weeks || [])));
                            setIsEditPlanOpen(true);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                          title="Edit weeks, buffer flags, and course modules"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit Weeks</span>
                        </button>
                        <button
                          onClick={() => {
                            setAdditionalWeeksCount(1);
                            setNewEndDateExtend(cohort.endDate);
                            setIsExtendWeeksOpen(true);
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Extend Weeks</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div>
                {activePlan ? (
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">{activePlan.name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {activePlan.coreWeeks ?? activePlan.weeks?.filter(w => !w.isBuffer && w.courses?.length > 0).length} Core Curriculum Weeks
                        {(activePlan.bufferWeeks > 0 || activePlan.weeks?.some(w => w.isBuffer || !w.courses?.length)) && (
                          <span className="text-amber-700 font-semibold">
                            {` + ${activePlan.bufferWeeks ?? activePlan.weeks?.filter(w => w.isBuffer || !w.courses?.length).length} Buffer Weeks`}
                          </span>
                        )}
                        {` (${activePlan.totalWeeks} Weeks Total)`}
                      </p>
                    </div>

                    <div className="space-y-1.5 pt-2 max-h-56 overflow-y-auto pr-1">
                      {activePlan.weeks?.map((w) => {
                        const isBuffer = w.isBuffer || !w.courses || w.courses.length === 0;

                        return (
                          <div
                            key={w.weekNumber}
                            className={`flex justify-between items-center text-xs p-2.5 rounded-xl border transition-all ${
                              isBuffer
                                ? 'bg-amber-50/70 border-amber-200/90 text-amber-950'
                                : 'bg-slate-50 border-slate-100 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                                  isBuffer ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {w.weekNumber}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold">
                                  {w.title || (isBuffer ? `Week ${w.weekNumber} (Buffer)` : `Week ${w.weekNumber}`)}
                                </span>
                                {isBuffer && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                                    Buffer Week
                                  </span>
                                )}
                              </div>
                            </div>

                            <span
                              className={`font-mono text-[11px] ${
                                isBuffer ? 'text-amber-800 font-bold' : 'text-slate-500'
                              }`}
                            >
                              {isBuffer ? '0 Courses (Buffer Period)' : `${w.courses?.length || 0} modules`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    No training plan applied yet. Go to the Cohort Config tab to select and apply a training plan.
                  </p>
                )}
              </div>
            </section>

            <section className="min-w-0 pt-7 md:pt-0 md:pl-8">
              <div className="mb-4 border-b border-slate-200 pb-3">
                <div className="flex items-center justify-between w-full">
                  <CardTitle subtitle="Independent feedback questionnaire copy">
                    Applied Feedback Form
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={activeForm ? 'active' : 'draft'}>
                      {activeForm ? `${activeForm.fields?.length || 0} Questions` : 'Not Set'}
                    </Badge>
                    {activeForm && (
                      <button
                        onClick={() => {
                          setEditableFormFields(JSON.parse(JSON.stringify(activeForm.fields || [])));
                          setIsEditFormOpen(true);
                        }}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Form</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                {activeForm ? (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-800">{activeForm.name}</h4>
                    <p className="text-xs text-slate-500">{activeForm.fields?.length || 0} Dynamic Form Fields</p>
                    <div className="space-y-1.5 pt-2 max-h-56 overflow-y-auto pr-1">
                      {activeForm.fields?.map((f) => (
                        <div key={f.key} className="flex justify-between items-center text-xs p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="font-semibold text-slate-700">{f.label}</span>
                          <span className="text-slate-400 uppercase text-[10px] font-mono bg-slate-200/60 px-1.5 py-0.5 rounded">{f.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    No feedback form applied yet. Go to the Cohort Config tab to select and apply a feedback form.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: NOMINEES (MENTORS + ALLOCATED TRAINEES) */}
      {activeTab === 'nominations' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-800">Mentors & Assigned Trainees</h3>
              <p className="text-xs text-slate-500">Mentors in this cohort. Add more from the nominations list.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAllocateMentorsOpen(true)}
              disabled={isLocked}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Mentors from Nominations</span>
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by mentor name, trainee name, employee ID or email..."
                className="w-full pl-10 pr-9 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={assignmentFilter}
                onChange={(e) => setAssignmentFilter(e.target.value)}
                className="w-full md:w-44 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
              >
                <option value="ALL">All Mentors</option>
                <option value="ASSIGNED">With Trainees</option>
                <option value="UNASSIGNED">No Trainees Yet</option>
              </select>
            </div>
          </div>

          {/* Mentors with Trainees Grid */}
          {mentorsLoading ? (
            <div className="divide-y divide-slate-200 border-y border-slate-200">{[1, 2, 3].map((row) => <div key={row} className="h-20 animate-pulse bg-slate-50" />)}</div>
          ) : filteredMentors.length === 0 ? (
            <EmptyState
              icon={searchTerm || assignmentFilter !== 'ALL' ? Search : Award}
              title={searchTerm || assignmentFilter !== 'ALL' ? 'No matching mentors or trainees' : 'No mentors registered'}
              description={
                searchTerm || assignmentFilter !== 'ALL'
                  ? `No mentors or trainees match your query "${searchTerm || 'selected filter'}".`
                  : 'Add mentors to this cohort so they can be assigned trainees.'
              }
              action={
                searchTerm || assignmentFilter !== 'ALL' ? (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setAssignmentFilter('ALL');
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold"
                  >
                    Clear Filters
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedMentorDetails(mentor)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    <Eye className="w-3.5 h-3.5" /> Details
                  </button>
                )
              }
            />
          ) : (
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {filteredMentors.map((mentor) => {
                const isMentorGloballyDeactivated = mentor.isActive === false || mentor.isAccountActive === false;
                const assignedTrainees = mentor.assignedTrainees || [];
                const activeAssignedTrainees = assignedTrainees.filter((trainee) => trainee.status !== 'dropped_out');
                const droppedOutAssignedTrainees = assignedTrainees.length - activeAssignedTrainees.length;
                const mentorSessionGroup = cohortSessionOverview.find(
                  (group) => String(group.mentorId) === String(mentor.userId)
                );
                const mentorBatches = mentorSessionGroup?.batches || [];
                const mentorSessionCount = mentorBatches.reduce((count, batch) => count + (batch.sessions?.length || 0), 0);

                return (
                  <section key={mentor.id} className="py-3">
                    <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_minmax(180px,1.2fr)_auto]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <h4 className="font-bold text-sm text-slate-900">{mentor.name}</h4>
                          {mentor.employeeId && <span className="font-mono text-[10px] text-slate-500">{mentor.employeeId}</span>}
                          {isMentorGloballyDeactivated && <Badge variant="danger" size="sm">Globally deactivated</Badge>}
                        </div>
                        <p className="truncate text-xs text-slate-500">{mentor.email}</p>
                      </div>
                      <div className="text-xs text-slate-600"><span className="text-slate-400">Nominated by · </span>{mentor.nominatorName || 'Administrator'}</div>
                      <div className="text-xs text-slate-700">
                        <span className="font-semibold">{activeAssignedTrainees.length}</span> active
                        {droppedOutAssignedTrainees > 0 && <span className="ml-2 text-rose-700">{droppedOutAssignedTrainees} dropped</span>}
                        <span className="mx-2 text-slate-300">·</span>{mentorBatches.length} batches<span className="mx-2 text-slate-300">·</span>{mentorSessionCount} sessions
                      </div>
                      <div className="flex items-center justify-between gap-3 lg:justify-end">
                        {mentor.isLoginActive ? (
                          <button
                            type="button"
                            onClick={() => toggleAccountMutation.mutate({ mentorId: mentor.id, isActive: !mentor.isCohortAccessActive })}
                            disabled={toggleAccountMutation.isPending}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold disabled:cursor-wait disabled:opacity-50 ${mentor.isCohortAccessActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                            title={`Click to ${mentor.isCohortAccessActive ? 'deactivate' : 'activate'} access in this cohort`}
                          >{mentor.isCohortAccessActive ? 'Deactivate for this cohort' : 'Activate for this cohort'}</button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setTargetMentor(mentor); setIsActivateModalOpen(true); }}
                            className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                          >Activate login</button>
                        )}
                        <button type="button" onClick={() => setSelectedMentorDetails(mentor)} className="shrink-0 text-xs font-semibold text-indigo-700 hover:text-indigo-900">
                          Details →
                        </button>
                      </div>

                      {/* 3. Assigned Trainees List (Inside the Mentor Card) */}
                      <div className="hidden">
                      <div className="pt-3 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-purple-600" />
                            <span>Allocated Trainees</span>
                          </span>
                          <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                            {assignedTrainees.length} {assignedTrainees.length === 1 ? 'Mentee' : 'Mentees'}
                          </span>
                        </div>

                        {assignedTrainees.length === 0 ? (
                          <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-100 text-center">
                            <p className="text-[11px] text-slate-400 italic">No trainees allocated to this mentor yet.</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Go to the "Assign Mentors" tab to pair mentees.</p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {assignedTrainees.map((t) => (
                              <div
                                key={t.id}
                                onClick={() => {
                                  setSelectedTraineeForFeedback({
                                    ...t,
                                    mentorName: mentor.name,
                                    mentorEmployeeId: mentor.employeeId,
                                    mentorEmail: mentor.email,
                                    mentorDepartment: mentor.department,
                                    mentorNominatedBy: mentor.nominatorName,
                                  });
                                  setIsTraineeFeedbackModalOpen(true);
                                }}
                                className="p-2.5 rounded-xl bg-slate-50/80 hover:bg-purple-50/40 border border-slate-100 hover:border-purple-200 transition-all cursor-pointer space-y-1.5 group shadow-2xs"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-xs font-bold text-slate-800 truncate group-hover:text-purple-900 transition-colors">
                                      {t.name}
                                    </span>
                                    <span className="text-[9px] font-mono font-bold text-slate-600 bg-white px-1.5 py-0.2 rounded border border-slate-200 shrink-0">
                                      {t.employeeId}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded">
                                      {t.department}
                                    </span>
                                    {/* Dedicated "Show Trainee Details" icon button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTraineeForFeedback({
                                          ...t,
                                          mentorName: mentor.name,
                                          mentorEmployeeId: mentor.employeeId,
                                          mentorEmail: mentor.email,
                                          mentorDepartment: mentor.department,
                                          mentorNominatedBy: mentor.nominatorName,
                                        });
                                        setIsTraineeFeedbackModalOpen(true);
                                      }}
                                      className="p-1 rounded-lg bg-white group-hover:bg-purple-100/80 text-slate-500 group-hover:text-purple-700 border border-slate-200 group-hover:border-purple-300 transition-colors"
                                      title="Show Trainee Details & Mentor Feedback"
                                    >
                                      <Eye className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="flex-1">
                                    <ProgressBar percent={t.percentComplete || 0} size="sm" showLabel={false} />
                                  </div>
                                  <span className="text-[10px] font-bold text-emerald-600 shrink-0">
                                    {t.percentComplete || 0}%
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTraineeForFeedback({
                                      ...t,
                                      mentorName: mentor.name,
                                      mentorEmployeeId: mentor.employeeId,
                                      mentorEmail: mentor.email,
                                      mentorDepartment: mentor.department,
                                      mentorNominatedBy: mentor.nominatorName,
                                    });
                                    setIsTraineeFeedbackModalOpen(true);
                                  }}
                                  className="w-full mt-1 py-1 px-2 rounded-lg bg-white hover:bg-purple-100/70 border border-slate-200/90 hover:border-purple-300 text-purple-700 text-[10px] font-bold flex items-center justify-between transition-colors shadow-2xs"
                                >
                                  <span className="flex items-center gap-1">
                                    <Eye className="w-3 h-3 text-purple-600" />
                                    <span>Show Trainee Details & Feedback</span>
                                  </span>
                                  <ChevronRight className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Training Groups & Sessions</span>
                          </span>
                          {!cohortSessionOverviewLoading && (
                            <span className="text-[10px] font-bold text-slate-500">
                              {mentorSessionGroup?.batches?.length || 0} groups
                            </span>
                          )}
                        </div>

                        {cohortSessionOverviewLoading ? (
                          <p className="text-[11px] text-slate-400">Loading groups and attendance...</p>
                        ) : !mentorSessionGroup?.batches?.length ? (
                          <p className="text-[11px] text-slate-400 italic">No batches created for this mentor yet.</p>
                        ) : (
                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {mentorSessionGroup.batches.map((batch) => (
                              <div key={batch.id} className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <strong className="text-xs text-slate-800">{batch.name}</strong>
                                  <span className="text-[10px] font-semibold text-slate-500">{batch.traineeCount} trainees</span>
                                </div>
                                <div className="space-y-1">
                                  {batch.trainees.map((trainee) => (
                                    <div key={trainee.traineeId} className="flex items-center justify-between gap-2 text-[10px] text-slate-600">
                                      <span className="truncate">{trainee.name}</span>
                                      <span className="shrink-0 text-slate-400">{trainee.location || 'Location not provided'}</span>
                                    </div>
                                  ))}
                                </div>

                                {batch.sessions.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic">No sessions scheduled.</p>
                                ) : (
                                  <div className="space-y-2 border-t border-emerald-100 pt-2">
                                    {batch.sessions.map((session) => (
                                      <div key={session.id} className="rounded-lg bg-white border border-slate-100 p-2.5">
                                        <div className="flex items-start justify-between gap-2">
                                          <div>
                                            <p className="text-[11px] font-bold text-slate-800">{session.title}</p>
                                            <p className="text-[10px] text-slate-500">
                                              {new Date(session.sessionDate).toLocaleDateString()} · {session.startTime}–{session.endTime}
                                            </p>
                                          </div>
                                          <span className="text-[9px] font-bold uppercase text-slate-500">
                                            {session.status?.replace('_', ' ')}
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1">
                                          Attendance: {session.presentCount} present · {session.attendanceCount}/{session.attendance.length} marked
                                        </p>
                                        <div className="mt-2 space-y-1">
                                          {session.attendance.map((record) => (
                                            <div key={record.traineeId} className="flex items-center justify-between gap-2 text-[10px]">
                                              <span className="text-slate-600">{record.name}</span>
                                              <span className={`font-bold ${record.status === 'present' ? 'text-emerald-600' : record.status === 'absent' ? 'text-rose-600' : record.status === 'not_marked' ? 'text-slate-400' : 'text-amber-600'}`}>
                                                {record.status.replace('_', ' ')}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      </div>
                    </div>

                    {selectedMentorDetails?.id === mentor.id && (
                      <Modal
                        isOpen
                        onClose={() => setSelectedMentorDetails(null)}
                        title={`Mentor Details · ${mentor.name}`}
                        fullScreen
                      >
                        <div className="space-y-5">
                          {isMentorGloballyDeactivated && (
                            <Badge variant="danger" size="sm">Globally deactivated</Badge>
                          )}
                          <section className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-slate-200 py-3 text-sm xl:grid-cols-5">
                            <div><span className="text-slate-500">Employee ID</span><p className="font-semibold text-slate-800">{mentor.employeeId || 'Not provided'}</p></div>
                            <div><span className="text-slate-500">Email</span><p className="font-semibold text-slate-800">{mentor.email}</p></div>
                            <div><span className="text-slate-500">Login</span><p className="font-semibold text-slate-800">{!mentor.isLoginActive ? 'Not activated' : isMentorGloballyDeactivated ? 'Deactivated' : mentor.firstLoginPasswordReset ? 'Password setup pending' : 'Active'}</p></div>
                            <div><span className="text-slate-500">Nominated by</span><p className="font-semibold text-slate-800">{mentor.nominatorName || 'Platform Administrator'}</p></div>
                            <div><span className="text-slate-500">Admission date</span><p className="font-semibold text-slate-800">{mentor.createdAt ? new Date(mentor.createdAt).toLocaleDateString() : 'Not provided'}</p></div>
                          </section>

                          {mentor.isLoginActive && mentor.userId && (
                            <div className="flex flex-col gap-2 border-y border-amber-200 bg-amber-50/50 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-bold text-amber-900">Mentor login credentials</p>
                                <p className="mt-0.5 text-xs text-amber-800">Passwords are stored securely and cannot be viewed. Reset to generate a one-time temporary password.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => resetMentorPasswordMutation.mutate(mentor.userId)}
                                disabled={resetMentorPasswordMutation.isPending}
                                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                                {resetMentorPasswordMutation.isPending ? 'Generating…' : 'Reset password'}
                              </button>
                            </div>
                          )}

                          <section>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-bold text-slate-800">Allocated Trainees</h4>
                              <span className="text-xs font-semibold text-purple-700">{activeAssignedTrainees.length} active · {droppedOutAssignedTrainees} dropped out</span>
                            </div>
                            {assignedTrainees.length ? (
                              <div className="overflow-x-auto border-y border-slate-200">
                                <table className="w-full min-w-[900px] text-left text-sm">
                                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Trainee</th><th className="px-3 py-2">Employee ID</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Progress</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Details</th></tr></thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {assignedTrainees.map((trainee) => (
                                      <tr key={trainee.id} className="hover:bg-slate-50/70">
                                        <td className="px-3 py-2"><p className="font-semibold text-slate-800">{trainee.name}</p><p className="text-xs text-slate-500">{trainee.email}</p></td>
                                        <td className="px-3 py-2 text-xs text-slate-600">{trainee.employeeId || '—'}{trainee.department ? ` · ${trainee.department}` : ''}</td>
                                        <td className="px-3 py-2 text-xs text-slate-600">{trainee.location || 'Not provided'}</td>
                                        <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-1 w-20 overflow-hidden rounded bg-slate-200"><div className="h-full bg-emerald-600" style={{ width: `${Math.max(0, Math.min(100, Number(trainee.percentComplete) || 0))}%` }} /></div><span className="text-xs tabular-nums text-slate-700">{trainee.percentComplete || 0}%</span></div></td>
                                        <td className={`px-3 py-2 text-xs font-semibold ${trainee.status === 'dropped_out' ? 'text-rose-700' : 'text-emerald-700'}`}>{trainee.status === 'dropped_out' ? `Dropped out${trainee.droppedOutAt ? ` · ${new Date(trainee.droppedOutAt).toLocaleDateString()}` : ''}` : 'Active'}{trainee.dropoutReason && <p className="font-normal text-rose-600">{trainee.dropoutReason}</p>}</td>
                                        <td className="px-3 py-2 text-right"><button type="button" onClick={() => { setSelectedTraineeForFeedback({ ...trainee, mentorName: mentor.name, mentorEmployeeId: mentor.employeeId, mentorEmail: mentor.email, mentorDepartment: mentor.department, mentorNominatedBy: mentor.nominatorName }); setIsTraineeFeedbackModalOpen(true); }} className="text-xs font-semibold text-purple-700 hover:text-purple-900">Details & feedback →</button></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : <p className="text-sm text-slate-500">No trainees assigned.</p>}
                          </section>

                          <section>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-bold text-slate-800">Training Groups & Sessions</h4>
                              <span className="text-xs text-slate-500">{mentorBatches.length} groups · {mentorSessionCount} sessions</span>
                            </div>
                            {cohortSessionOverviewLoading ? (
                              <p className="text-sm text-slate-500">Loading group and session details…</p>
                            ) : mentorBatches.length ? (
                              <div className="divide-y divide-slate-200 border-y border-slate-200">
                                {mentorBatches.map((batch) => (
                                  <div key={batch.id} className="py-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <h5 className="font-bold text-slate-800">{batch.name}</h5>
                                      <span className="text-xs text-slate-500">{batch.traineeCount} trainees</span>
                                    </div>
                                    <div className="mt-2 divide-y divide-slate-100 border-y border-slate-100">
                                      {batch.trainees.map((trainee) => (
                                        <div key={trainee.traineeId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 text-xs">
                                          <span className="font-semibold text-slate-700">{trainee.name}{trainee.status === 'dropped_out' && <span className="ml-2 text-rose-700">Dropped out</span>}</span>
                                          <span className="text-slate-500">{trainee.email}</span>
                                          <span className="text-slate-500">{trainee.location || 'Location not provided'}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-2 divide-y divide-slate-100">
                                      {batch.sessions.length ? batch.sessions.map((session) => (
                                        <div key={session.id} className="py-2">
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                              <p className="font-bold text-sm text-slate-800">{session.title}</p>
                                              <p className="text-xs text-slate-500">{new Date(session.sessionDate).toLocaleDateString()} · {session.startTime}–{session.endTime}</p>
                                            </div>
                                            <Badge>{session.status?.replace('_', ' ')}</Badge>
                                          </div>
                                          <p className="text-xs text-slate-500 mt-2">Attendance: {session.presentCount} present · {session.attendanceCount}/{session.attendance.length} marked</p>
                                          {session.attendance.length > 0 && (
                                            <div className="mt-2 border-t border-slate-100 pt-2 space-y-1">
                                              {session.attendance.map((record) => (
                                                <div key={record.traineeId} className="flex justify-between gap-3 text-xs">
                                                  <span className="text-slate-600">{record.name}</span>
                                                  <span className={`font-bold capitalize ${record.status === 'present' ? 'text-emerald-600' : record.status === 'absent' ? 'text-rose-600' : 'text-slate-400'}`}>{record.status.replace('_', ' ')}</span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )) : <p className="text-xs text-slate-500">No sessions scheduled for this group.</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-sm text-slate-500">No training groups created for this mentor.</p>}
                          </section>
                        </div>
                      </Modal>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ASSIGNMENTS (ADMIN ONLY ASSIGNS MENTOR TO TRAINEE) */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-800">Assign Mentor to Trainee</h3>
              <p className="text-xs text-slate-500">
                Add trainees from the nominations list, then pick a mentor for each one. Any mentor in this cohort can be assigned to any trainee.
                The system creates or updates the trainee's progress tracking automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAllocateTraineesOpen(true)}
              disabled={isLocked}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Trainees from Nominations</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_220px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={assignmentTraineeSearch}
                onChange={(event) => setAssignmentTraineeSearch(event.target.value)}
                placeholder="Search trainees by name, ID, email, or location"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={assignmentMentorSearch}
                onChange={(event) => setAssignmentMentorSearch(event.target.value)}
                placeholder="Find a mentor in assignment menus"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <select
              aria-label="Filter trainees by assigned mentor"
              value={assignmentMentorFilter}
              onChange={(event) => setAssignmentMentorFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            >
              <option value="ALL">All mentors</option>
              <option value="UNASSIGNED">Unassigned trainees</option>
              {assignmentMentors.map((mentor) => (
                <option key={mentor.id} value={mentor.id}>{mentor.name}{mentor.isActive === false || mentor.isAccountActive === false ? ' · Globally deactivated' : mentor.isCohortAccessActive === false ? ' · Cohort access deactivated' : ''}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto border-y border-slate-200">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Trainee</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned mentor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
            {filteredAssignmentTrainees.map((trainee) => {
              const currentMentorId = trainee.mentorId || '';
              const cohortMentors = assignmentMentors;
              const assignedMentor = cohortMentors.find((mentor) => mentor.id === currentMentorId);
              const assignedMentorIsDeactivated = Boolean(
                assignedMentor && (
                  assignedMentor.isActive === false
                  || assignedMentor.isAccountActive === false
                  || assignedMentor.isCohortAccessActive === false
                )
              );
              const assignableMentors = cohortMentors.filter((mentor) =>
                mentor.id === currentMentorId || (
                  mentor.isActive !== false
                  && mentor.isAccountActive !== false
                  && mentor.isCohortAccessActive !== false
                )
              );

              return (
                    <tr key={trainee.id} className="align-top hover:bg-slate-50/70">
                      <th scope="row" className="px-4 py-3 font-semibold text-slate-900">
                        {trainee.name}
                        <p className="mt-0.5 text-xs font-normal text-slate-500">{trainee.employeeId || '—'} · {trainee.email}</p>
                        <p className="mt-0.5 text-xs font-normal text-slate-500">{trainee.department || '—'}</p>
                      </th>
                      <td className="px-4 py-3 text-slate-600">{trainee.location || '—'}{trainee.timezone ? <p className="mt-0.5 text-xs text-slate-500">{trainee.timezone}</p> : null}</td>
                      <td className="px-4 py-3"><div className="w-28"><ProgressBar percent={trainee.percentComplete || 0} size="sm" /></div></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold ${trainee.status === 'dropped_out' ? 'text-rose-700' : trainee.mentorId ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {trainee.status === 'dropped_out' ? 'Dropped out' : trainee.mentorId ? 'Assigned' : 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                      <select
                        value={currentMentorId}
                        disabled={trainee.status === 'dropped_out' || isLocked}
                        onChange={(e) => {
                          const mentorId = e.target.value;
                          if (mentorId) assignMentorMutation.mutate({ traineeId: trainee.id, mentorId });
                        }}
                        className="w-72 max-w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        <option value="">-- Select a Mentor --</option>
                        {assignedMentorIsDeactivated && (
                          <option value={assignedMentor.id} disabled>
                            {assignedMentor.name} ({assignedMentor.employeeId || 'EMP'}) · Deactivated (currently assigned)
                          </option>
                        )}
                        {assignableMentors.filter((mentor) => mentor.id === currentMentorId || mentorOptionsForAssignment.some((option) => option.id === mentor.id)).map((m) => (
                          <option key={m.id} value={m.id} disabled={m.id !== currentMentorId && (m.isActive === false || m.isAccountActive === false || m.isCohortAccessActive === false)}>
                            {m.name} ({m.employeeId || 'EMP'}) · {m.assignedTraineesCount} trainees
                          </option>
                        ))}
                      </select>
                      {assignedMentorIsDeactivated && trainee.status !== 'dropped_out' && <p className="mt-1 max-w-xs text-xs text-amber-700">Currently assigned to a deactivated mentor. Choose an active mentor to reassign.</p>}
                      {trainee.status === 'dropped_out' && <p className="mt-1 text-xs text-rose-600">Assignment closed</p>}
                      </td>
                    </tr>
              );
            })}
                {!filteredAssignmentTrainees.length && (
                  <tr><td colSpan="5" className="px-4 py-10 text-center text-sm text-slate-500">No trainees match these search and filter settings.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TALENTNEXT COURSES MANAGEMENT */}
      {activeTab === 'talentnext' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">TalentNext Courses</h2>
              <p className="text-sm text-slate-500 mt-1">View, edit, and manage TalentNext courses for this cohort</p>
            </div>
            <button
              onClick={() => setIsTalentNextModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Course</span>
            </button>
          </div>

          {/* Courses List */}
          <div>
            {cohort?.talentnextCourses && cohort.talentnextCourses.length > 0 ? (
              <div className="overflow-x-auto border-y border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Course</th><th className="px-4 py-3">Requirement</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-200">
                  {cohort.talentnextCourses.map((assignment, idx) => (
                    <tr key={assignment.courseId || idx} className="hover:bg-slate-50/70">
                      <th scope="row" className="px-4 py-3 font-semibold text-slate-900">{courseNameMap[assignment.courseId] || `Course (${assignment.courseId.substring(0, 8)}...)`}</th>
                      <td className="px-4 py-3 text-slate-700">{assignment.isMandatory ? 'Mandatory' : 'Optional'}</td>
                      <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setEditingCourseId(assignment.courseId);
                          setSelectedCourseMandatory(assignment.isMandatory);
                          setIsTalentNextModalOpen(true);
                        }}
                        className="mr-3 text-xs font-semibold text-slate-600 hover:text-slate-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          const updated = cohort.talentnextCourses.filter((_, i) => i !== idx);
                          updateCohortMutation.mutate(
                            { talentnextCourses: updated },
                            {
                              onSuccess: () => {
                                showToast('Course removed from cohort');
                                queryClient.invalidateQueries({ queryKey: ['cohort', cohortId] });
                              },
                              onError: (err) => {
                                showToast(`Failed to remove course: ${err.message}`, 'error');
                              }
                            }
                          );
                        }}
                        className="text-xs font-semibold text-rose-700 hover:text-rose-900"
                      >
                        Remove
                      </button>
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={BookOpen}
                title="No TalentNext courses assigned"
                description="Add TalentNext courses to provide trainees with learning paths"
                action={
                  <button
                    onClick={() => setIsTalentNextModalOpen(true)}
                    className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add First Course</span>
                  </button>
                }
              />
            )}
          </div>
        </div>
      )}

      {activeTab === 'nominators' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Cohort Nominators</h2>
              <p className="mt-1 text-sm text-slate-500">Create nominators who can submit mentor and trainee candidates for this cohort.</p>
            </div>
            <button
              onClick={() => setIsNominatorModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <UserPlus className="h-4 w-4" />
              <span>Create Nominator</span>
            </button>
          </div>

          {cohortNominatorsLoading ? (
            <div className="divide-y divide-slate-200 border-y border-slate-200">{[1, 2, 3].map((row) => <div key={row} className="h-14 animate-pulse bg-slate-50" />)}</div>
          ) : cohortNominators.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="No nominator accounts"
              description="Create a nominator account to let someone submit mentor and trainee candidates."
              action={(
                <button onClick={() => setIsNominatorModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white">
                  <UserPlus className="h-4 w-4" /> Create Nominator
                </button>
              )}
            />
          ) : (
            <div className="overflow-x-auto border-y border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3">Nominator</th><th className="px-4 py-3">Employee ID</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Access</th><th className="px-4 py-3 text-right">Nominations</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {cohortNominators.map((nominator) => (
                    <tr key={nominator.id} className="hover:bg-slate-50/70">
                      <th scope="row" className="px-4 py-3 font-semibold text-slate-900">
                        {nominator.name}<p className="mt-0.5 text-xs font-normal text-slate-500">{nominator.email}</p>
                      </th>
                      <td className="px-4 py-3 text-slate-700">{nominator.employeeId || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold ${!nominator.isActive ? 'text-rose-700' : nominator.firstLoginPasswordReset ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {!nominator.isActive ? 'Deactivated' : nominator.firstLoginPasswordReset ? 'Password setup pending' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          aria-label={`${nominator.isActive ? 'Deactivate' : 'Activate'} ${nominator.name}`}
                          onClick={() => toggleNominatorMutation.mutate({ userId: nominator.id, isActive: !nominator.isActive })}
                          disabled={toggleNominatorMutation.isPending}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-wait disabled:opacity-50 ${nominator.isActive ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                        >{nominator.isActive ? 'Deactivate' : 'Activate'}</button>
                      </td>
                      <td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedNominatorDetails(nominator)} className="font-semibold text-emerald-700 hover:text-emerald-900">View nominees →</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={!!selectedNominatorDetails}
        onClose={() => setSelectedNominatorDetails(null)}
        title={selectedNominatorDetails ? `Nominator Details · ${selectedNominatorDetails.name}` : 'Nominator Details'}
        maxWidth="max-w-4xl"
      >
        {selectedNominatorDetails && (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm sm:grid-cols-3">
              <div><span className="text-slate-500">Employee ID</span><p className="font-semibold text-slate-800">{selectedNominatorDetails.employeeId || '—'}</p></div>
              <div><span className="text-slate-500">Email</span><p className="font-semibold text-slate-800">{selectedNominatorDetails.email}</p></div>
              <div><span className="text-slate-500">Account</span><p className="font-semibold text-slate-800">{!selectedNominatorDetails.isActive ? 'Deactivated' : selectedNominatorDetails.firstLoginPasswordReset ? 'Password setup pending' : 'Active'}</p></div>
            </div>

            {nominatorSubmissionsLoading ? <p className="text-sm text-slate-500">Loading nominations…</p> : (
              <div className="grid gap-5 md:grid-cols-2">
                <section>
                  <h4 className="mb-3 font-bold text-slate-800">Nominated Mentors ({nominatorSubmissions?.mentors?.length || 0})</h4>
                  <div className="space-y-2">
                    {nominatorSubmissions?.mentors?.length ? nominatorSubmissions.mentors.map((person) => (
                      <div key={person.id} className="rounded-xl border border-slate-200 p-3">
                        <p className="font-semibold text-slate-800">{person.name}</p>
                        <p className="text-xs text-slate-500">{person.email}</p>
                        <p className="mt-1 text-xs text-slate-500">ID: {person.employeeId || '—'} · {person.department || 'No department'}</p>
                        <Badge variant={!person.isLoginActive || !person.isAccountActive ? 'draft' : 'active'}>
                          {!person.isLoginActive ? 'Pending admin activation' : !person.isAccountActive ? 'Account deactivated' : 'Login active'}
                        </Badge>
                      </div>
                    )) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No mentors nominated by this user.</p>}
                  </div>
                </section>
                <section>
                  <h4 className="mb-3 font-bold text-slate-800">Nominated Trainees ({nominatorSubmissions?.trainees?.length || 0})</h4>
                  <div className="space-y-2">
                    {nominatorSubmissions?.trainees?.length ? nominatorSubmissions.trainees.map((person) => (
                      <div key={person.id} className="rounded-xl border border-slate-200 p-3">
                        <p className="font-semibold text-slate-800">{person.name}</p>
                        <p className="text-xs text-slate-500">{person.email}</p>
                        <p className="mt-1 text-xs text-slate-500">ID: {person.employeeId || '—'} · {person.department || 'No department'}</p>
                        <p className="text-xs text-slate-500">Location: {person.location || 'Not provided'}{person.timezone ? ` · ${person.timezone}` : ''}</p>
                        {person.status === 'dropped_out' && <Badge variant="draft">Dropped out</Badge>}
                      </div>
                    )) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No trainees nominated by this user.</p>}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!mentorTemporaryCredentials}
        onClose={() => setMentorTemporaryCredentials(null)}
        title="Mentor Temporary Password"
        maxWidth="max-w-lg"
      >
        {mentorTemporaryCredentials && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{mentorTemporaryCredentials.name}</p>
              <p className="text-xs text-slate-500">{mentorTemporaryCredentials.email}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-emerald-800">Temporary password — show once</label>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-800">{mentorTemporaryCredentials.password}</code>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(mentorTemporaryCredentials.password);
                      showToast('Temporary password copied');
                    } catch {
                      showToast('Could not copy the password. Select and copy it manually.', 'warning');
                    }
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                ><Copy className="h-3.5 w-3.5" /> Copy</button>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">Share this temporary password securely. The mentor must enter it as their current password and set a new password on first login. This password cannot be viewed again.</p>
            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setMentorTemporaryCredentials(null)} className="rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-900">Done</button>
            </div>
          </div>
        )}
      </Modal>


      {/* MODAL: Add nominated mentors / trainees to this cohort */}
      <AllocateNomineesModal
        isOpen={isAllocateMentorsOpen}
        onClose={() => setIsAllocateMentorsOpen(false)}
        kind="mentor"
        cohortId={cohortId}
        cohortName={cohort.name}
      />
      <AllocateNomineesModal
        isOpen={isAllocateTraineesOpen}
        onClose={() => setIsAllocateTraineesOpen(false)}
        kind="trainee"
        cohortId={cohortId}
        cohortName={cohort.name}
      />

      {/* MODAL: Activate Mentor Login */}
      <Modal isOpen={isActivateModalOpen} onClose={() => setIsActivateModalOpen(false)} title={`Activate Login: ${targetMentor?.name}`}>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            Activate a mentor login for <strong>{targetMentor?.email}</strong>. A temporary password will be generated and shown once. The mentor must create a new password the first time they sign in.
          </p>
          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsActivateModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => activateLoginMutation.mutate()}
              disabled={activateLoginMutation.isPending}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{activateLoginMutation.isPending ? 'Activating…' : 'Activate & Generate Password'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Edit Cohort Profile */}
      <Modal
        isOpen={isEditTimelineOpen}
        onClose={() => setIsEditTimelineOpen(false)}
        title="Edit Cohort Profile"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateCohortMutation.mutate({
              name: editName,
              description: editDesc,
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Cohort Name
            </label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Description
            </label>
            <textarea
              rows={2}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditTimelineOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateCohortMutation.isPending}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{updateCohortMutation.isPending ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Extend Weeks for Cohort Curriculum */}
      <Modal
        isOpen={isExtendWeeksOpen}
        onClose={() => setIsExtendWeeksOpen(false)}
        title="Extend Curriculum & Add Weeks"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            extendWeeksMutation.mutate({
              additionalWeeks: parseInt(additionalWeeksCount, 10),
              newEndDate: newEndDateExtend || undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-1">
            <p className="font-bold">
              Current Curriculum: {activePlan?.totalWeeks || 0} Weeks ({activePlan?.coreWeeks ?? activePlan?.weeks?.filter(w => !w.isBuffer && w.courses?.length > 0).length} Core + {activePlan?.bufferWeeks ?? activePlan?.weeks?.filter(w => w.isBuffer || !w.courses?.length).length} Buffer)
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Extended weeks are added as <strong>Buffer Weeks</strong> (with 0 course modules). Trainees use this buffer period to catch up on assignments, complete projects, and submit weekly mentor feedback without artificial dummy courses.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Number of Additional Weeks to Add
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    setAdditionalWeeksCount(count);
                    const baseDate = new Date(cohort.endDate);
                    baseDate.setDate(baseDate.getDate() + count * 7);
                    setNewEndDateExtend(baseDate.toISOString().split('T')[0]);
                  }}
                  className={`py-2 text-xs font-bold rounded-xl border text-center transition-all ${
                    additionalWeeksCount === count
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  +{count} {count === 1 ? 'Week' : 'Weeks'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Extended Cohort End Date (Optional)
            </label>
            <input
              type="date"
              value={newEndDateExtend}
              onChange={(e) => setNewEndDateExtend(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              New total curriculum will become {(activePlan?.totalWeeks || 0) + parseInt(additionalWeeksCount, 10)} Weeks.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsExtendWeeksOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={extendWeeksMutation.isPending}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{extendWeeksMutation.isPending ? 'Extending...' : `Extend by +${additionalWeeksCount} Week(s)`}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Edit Applied Training Plan & Weeks */}
      <Modal
        isOpen={isEditPlanOpen}
        onClose={() => setIsEditPlanOpen(false)}
        title="Edit Cohort Training Plan & Curriculum Weeks"
        maxWidth="max-w-4xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editablePlanWeeks.length === 0) {
              showToast('At least 1 week is required in the training plan', 'error');
              return;
            }
            const cleanedWeeks = editablePlanWeeks.map((w, idx) => ({
              weekNumber: idx + 1,
              title: (w.title || '').trim() || `Week ${idx + 1}`,
              isBuffer: !!w.isBuffer,
              courses: (w.courses || []).map((c) => ({
                courseId: c.courseId || undefined,
                title: (c.title || '').trim(),
                durationHrs: Number(c.durationHrs) || 1,
                description: c.description || '',
              })),
            }));

            for (let w of cleanedWeeks) {
              for (let c of w.courses) {
                if (!c.title) {
                  showToast(`Please enter a title for all modules in Week ${w.weekNumber}`, 'error');
                  return;
                }
              }
            }

            updatePlanMutation.mutate({
              name: editablePlanName.trim() || activePlan?.name || 'Cohort Training Plan',
              totalWeeks: cleanedWeeks.length,
              weeks: cleanedWeeks,
            });
          }}
          className="space-y-5"
        >
          {/* Plan Name & Stats Bar */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Plan Name
              </label>
              <input
                type="text"
                required
                value={editablePlanName}
                onChange={(e) => setEditablePlanName(e.target.value)}
                placeholder="e.g. Full-Stack Engineering Curriculum"
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-600">Overview:</span>
                <span className="bg-slate-200/80 text-slate-700 font-bold px-2 py-0.5 rounded-md text-[11px]">
                  {editablePlanWeeks.length} Weeks Total
                </span>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md text-[11px]">
                  {editablePlanWeeks.filter((w) => !w.isBuffer && w.courses?.length > 0).length} Core
                </span>
                <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md text-[11px]">
                  {editablePlanWeeks.filter((w) => w.isBuffer || !w.courses?.length).length} Buffer
                </span>
                <span className="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-md text-[11px]">
                  {editablePlanWeeks.reduce((acc, w) => acc + (w.courses?.length || 0), 0)} Total Modules
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const nextNum = editablePlanWeeks.length + 1;
                  setEditablePlanWeeks([
                    ...editablePlanWeeks,
                    {
                      weekNumber: nextNum,
                      title: `Week ${nextNum}`,
                      isBuffer: false,
                      courses: [],
                    },
                  ]);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Week</span>
              </button>
            </div>
          </div>

          {/* Weeks List */}
          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            {editablePlanWeeks.map((week, wIdx) => {
              const isBuffer = !!week.isBuffer;
              return (
                <div
                  key={wIdx}
                  className={`p-4 rounded-2xl border transition-all ${
                    isBuffer
                      ? 'bg-amber-50/40 border-amber-200/90'
                      : 'bg-white border-slate-200 shadow-2xs'
                  }`}
                >
                  {/* Week Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
                      <span
                        className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                          isBuffer ? 'bg-amber-500 text-white' : 'bg-slate-800 text-white'
                        }`}
                      >
                        W{wIdx + 1}
                      </span>
                      <input
                        type="text"
                        required
                        value={week.title}
                        onChange={(e) => {
                          const updated = [...editablePlanWeeks];
                          updated[wIdx].title = e.target.value;
                          setEditablePlanWeeks(updated);
                        }}
                        placeholder={`Week ${wIdx + 1} Title...`}
                        className="flex-1 px-3 py-1.5 text-xs font-bold text-slate-800 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Buffer Checkbox Toggle */}
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold">
                        <input
                          type="checkbox"
                          checked={isBuffer}
                          onChange={(e) => {
                            const updated = [...editablePlanWeeks];
                            updated[wIdx].isBuffer = e.target.checked;
                            setEditablePlanWeeks(updated);
                          }}
                          className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                        />
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] ${
                            isBuffer
                              ? 'bg-amber-100 text-amber-900 border border-amber-200 font-bold'
                              : 'text-slate-600'
                          }`}
                        >
                          Buffer Week
                        </span>
                      </label>

                      {/* Delete Week */}
                      {editablePlanWeeks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const filtered = editablePlanWeeks
                              .filter((_, i) => i !== wIdx)
                              .map((w, i) => ({ ...w, weekNumber: i + 1 }));
                            setEditablePlanWeeks(filtered);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete this week"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Modules inside Week */}
                  <div className="pt-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Course Modules ({week.courses?.length || 0})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...editablePlanWeeks];
                          if (!updated[wIdx].courses) updated[wIdx].courses = [];
                          updated[wIdx].courses.push({
                            courseId: '',
                            title: '',
                            durationHrs: 1.0,
                            description: '',
                          });
                          setEditablePlanWeeks(updated);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-dashed border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3 h-3 text-slate-500" />
                        <span>Add Module</span>
                      </button>
                    </div>

                    {(!week.courses || week.courses.length === 0) ? (
                      <div className="p-3 bg-slate-50/70 rounded-xl border border-dashed border-slate-200 text-center">
                        <p className="text-[11px] text-slate-500 italic">
                          {isBuffer
                            ? 'Buffer week period with 0 modules (no formal coursework). You can add modules if needed.'
                            : 'No course modules configured for this week yet. Click "+ Add Module" above to add one.'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {week.courses.map((course, cIdx) => (
                          <div
                            key={cIdx}
                            className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                required
                                value={course.title}
                                onChange={(e) => {
                                  const updated = [...editablePlanWeeks];
                                  updated[wIdx].courses[cIdx].title = e.target.value;
                                  setEditablePlanWeeks(updated);
                                }}
                                placeholder="Module title (e.g. React Hooks Deep Dive)..."
                                className="flex-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                              />

                              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shrink-0">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <input
                                  type="number"
                                  min="0.5"
                                  step="0.5"
                                  value={course.durationHrs ?? 1}
                                  onChange={(e) => {
                                    const updated = [...editablePlanWeeks];
                                    updated[wIdx].courses[cIdx].durationHrs = parseFloat(e.target.value) || 1;
                                    setEditablePlanWeeks(updated);
                                  }}
                                  className="w-12 text-xs font-semibold text-slate-700 bg-transparent focus:outline-none text-right"
                                />
                                <span className="text-[10px] text-slate-400 font-bold">hrs</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...editablePlanWeeks];
                                  updated[wIdx].courses = updated[wIdx].courses.filter((_, i) => i !== cIdx);
                                  setEditablePlanWeeks(updated);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                title="Remove module"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <input
                              type="text"
                              value={course.description || ''}
                              onChange={(e) => {
                                const updated = [...editablePlanWeeks];
                                updated[wIdx].courses[cIdx].description = e.target.value;
                                setEditablePlanWeeks(updated);
                              }}
                              placeholder="Module summary / learning objective (optional)..."
                              className="w-full px-2.5 py-1 text-[11px] text-slate-600 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                const nextNum = editablePlanWeeks.length + 1;
                setEditablePlanWeeks([
                  ...editablePlanWeeks,
                  {
                    weekNumber: nextNum,
                    title: `Week ${nextNum}`,
                    isBuffer: false,
                    courses: [],
                  },
                ]);
              }}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Week</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditPlanOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updatePlanMutation.isPending}
                className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{updatePlanMutation.isPending ? 'Saving Plan...' : 'Save Curriculum Changes'}</span>
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL: Edit Live Feedback Form */}
      <Modal
        isOpen={isEditFormOpen}
        onClose={() => setIsEditFormOpen(false)}
        title="Edit Cohort Evaluation Questionnaire"
        maxWidth="max-w-2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateFormMutation.mutate({
              fields: editableFormFields
            });
          }}
          className="space-y-4"
        >
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Questionnaire Metrics ({editableFormFields.length})
            </span>
            <button
              type="button"
              onClick={() => {
                const nextNum = editableFormFields.length + 1;
                setEditableFormFields([
                  ...editableFormFields,
                  {
                    key: `metric_${nextNum}`,
                    label: `Evaluation Metric ${nextNum}`,
                    type: 'rating',
                    options: [],
                    required: true
                  }
                ]);
              }}
              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Add Question</span>
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
            {editableFormFields.map((field, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={field.label}
                    onChange={(e) => {
                      const updated = [...editableFormFields];
                      updated[idx].label = e.target.value;
                      setEditableFormFields(updated);
                    }}
                    placeholder="Question label..."
                    className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
                  />
                  <select
                    value={field.type}
                    onChange={(e) => {
                      const updated = [...editableFormFields];
                      updated[idx].type = e.target.value;
                      setEditableFormFields(updated);
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="rating">Rating (1-5)</option>
                    <option value="text">Text Response</option>
                    <option value="select">Select Dropdown</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setEditableFormFields(editableFormFields.filter((_, i) => i !== idx));
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pl-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => {
                        const updated = [...editableFormFields];
                        updated[idx].required = e.target.checked;
                        setEditableFormFields(updated);
                      }}
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-[11px] font-semibold">Required Question</span>
                  </label>
                  <span className="font-mono text-[10px] text-slate-400">key: {field.key}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditFormOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateFormMutation.isPending}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{updateFormMutation.isPending ? 'Saving...' : 'Save Feedback Form'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: View Trainee Mentorship & Weekly Feedback */}
      <Modal
        isOpen={isTraineeFeedbackModalOpen}
        onClose={() => {
          setIsTraineeFeedbackModalOpen(false);
          setSelectedTraineeForFeedback(null);
        }}
        title="Trainee Mentorship & Weekly Feedback Log"
        fullScreen
      >
        {traineeFeedbackLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 space-y-2">
            <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Loading mentorship details and evaluations...</p>
          </div>
        ) : !traineeFeedbackDetail ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">Unable to load trainee details.</p>
        ) : (
          <div className="space-y-5">
            {/* 1. Dual Overview Cards: Trainee Info & Mentor Info */}
            <div className="grid grid-cols-1 gap-x-8 divide-y divide-slate-200 border-y border-slate-200 xl:grid-cols-2 xl:divide-x xl:divide-y-0">
              {/* Trainee Card */}
              <section className="space-y-2 py-3 xl:pr-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full">
                    Trainee Profile
                  </span>
                  <span className="font-mono text-[10px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {traineeFeedbackDetail.trainee?.employeeId}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 text-base">{traineeFeedbackDetail.trainee?.name}</h4>
                  <p className="text-xs text-slate-500">{traineeFeedbackDetail.trainee?.email}</p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-blue-100/80 text-blue-800 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                    {traineeFeedbackDetail.trainee?.department}
                  </span>
                  <span className="text-slate-400">&bull;</span>
                  <span className="text-slate-600 text-[11px] truncate">{cohort?.name}</span>
                </div>

                {/* Progress bar inside Trainee card */}
                <div className="border-t border-slate-100 pt-2">
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-semibold text-slate-600">Curriculum Completion</span>
                    <span className="font-bold text-emerald-600">
                      {traineeFeedbackDetail.progress?.percentComplete || 0}%
                    </span>
                  </div>
                  <ProgressBar percent={traineeFeedbackDetail.progress?.percentComplete || 0} size="sm" showLabel={false} />
                  <p className="text-[10px] text-slate-400 mt-1 text-right">
                    {traineeFeedbackDetail.progress?.items?.filter(i => i.completed).length || 0} of {traineeFeedbackDetail.progress?.items?.length || 0} courses complete
                  </p>
                </div>
              </section>

              {/* Mentor Card */}
              <section className="space-y-2 py-3 xl:pl-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-full">
                    Assigned Mentor
                  </span>
                  <span className="font-mono text-[10px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {traineeFeedbackDetail.mentor?.employeeId || selectedTraineeForFeedback?.mentorEmployeeId || 'EMP-MTR'}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 text-base">
                    {traineeFeedbackDetail.mentor?.name || selectedTraineeForFeedback?.mentorName || 'Assigned Mentor'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {traineeFeedbackDetail.mentor?.email || selectedTraineeForFeedback?.mentorEmail || 'mentor@example.com'}
                  </p>
                </div>

                <span className="text-emerald-700 font-semibold text-[11px] inline-flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>Active Mentor</span>
                </span>

                <div className="border-t border-slate-100 pt-2 text-[11px] space-y-1">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Nominated By:</span>
                    <span className="font-bold text-slate-800">
                      {traineeFeedbackDetail.mentor?.nominatorName || selectedTraineeForFeedback?.mentorNominatedBy || 'Platform Administrator'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Weekly Reviews Given:</span>
                    <span className="font-bold text-purple-700">
                      {traineeFeedbackDetail.feedbackHistory?.length || 0} Submitted
                    </span>
                  </div>
                </div>
              </section>
            </div>

            {/* 2. TalentNext Courses Completion Status (Styled like Weekly Feedback) */}
            {traineeFeedbackDetail.talentnextCourses && traineeFeedbackDetail.talentnextCourses.length > 0 && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setExpandedTalentNext(!expandedTalentNext)}
                  className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
                >
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-blue-600" />
                      <span>TalentNext Courses Completion</span>
                    </h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Professional development courses completed by trainee
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                      {traineeFeedbackDetail.talentnextProgress?.completionMap 
                        ? Object.values(traineeFeedbackDetail.talentnextProgress.completionMap).filter(c => c.completed).length 
                        : 0} of {traineeFeedbackDetail.talentnextCourses.length}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-blue-600 transition-transform ${expandedTalentNext ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Courses List - Collapsible */}
                {expandedTalentNext && (
                  <div className="divide-y divide-slate-100 border-y border-slate-200">
                    {traineeFeedbackDetail.talentnextCourses.map((course) => {
                      const completionMap = traineeFeedbackDetail.talentnextProgress?.completionMap || {};
                      const courseCompletion = completionMap[course.id];
                      const isCompleted = courseCompletion?.completed || false;

                      return (
                        <div
                          key={course.id}
                          className={`flex items-center justify-between gap-4 py-2.5 transition-all ${
                            isCompleted
                              ? 'text-emerald-900'
                              : 'text-slate-700'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`h-5 w-5 rounded flex items-center justify-center shrink-0 ${
                              isCompleted
                                ? 'bg-emerald-600 text-white'
                                : 'border-2 border-slate-300 bg-white'
                            }`}>
                              {isCompleted && <Check className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <h6 className={`text-xs font-bold ${isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                                  {course.name}
                                </h6>
                                {isCompleted ? (
                                  <Badge variant="active">Completed</Badge>
                                ) : (
                                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                                    Pending
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {course.isMandatory && (
                                  <span className="text-[10px] font-bold text-amber-700">
                                    MANDATORY
                                  </span>
                                )}
                                {isCompleted && courseCompletion?.completedAt && (
                                  <p className="text-[10px] text-slate-500">
                                    • Completed on {new Date(courseCompletion.completedAt).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3. Weekly Feedback Given to the Trainee from Mentor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4 text-purple-600" />
                    <span>Weekly Feedback Reviews Given by Mentor</span>
                  </h5>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {traineeFeedbackDetail.feedbackForm?.name || 'Cohort Evaluation Questionnaire'} &bull; Evaluations across all weeks
                  </p>
                </div>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
                  {traineeFeedbackDetail.feedbackHistory?.length || 0} of {traineeFeedbackDetail.plan?.totalWeeks || activePlan?.totalWeeks || 4} Weeks Reviewed
                </span>
              </div>

              {/* Weeks List */}
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {Array.from({ length: traineeFeedbackDetail.plan?.totalWeeks || activePlan?.totalWeeks || 4 }, (_, i) => i + 1).map((wNum) => {
                  const fb = traineeFeedbackDetail.feedbackHistory?.find((f) => f.weekNumber === wNum);
                  const weekObj = traineeFeedbackDetail.plan?.weeks?.find(w => w.weekNumber === wNum);
                  const isBuffer = weekObj?.isBuffer || !weekObj?.courses || weekObj.courses.length === 0;

                  return (
                    <div
                      key={wNum}
                      className={`py-3 transition-all ${
                        fb 
                          ? 'bg-emerald-50/30'
                          : isBuffer
                          ? 'bg-amber-50/30'
                          : 'bg-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                            fb 
                              ? 'bg-emerald-600 text-white' 
                              : isBuffer
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {fb ? <Check className="w-4 h-4" /> : `W${wNum}`}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-800">
                                Week {wNum} Evaluation
                              </span>
                              {isBuffer && (
                                <span className="text-[10px] font-bold uppercase text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                                  Buffer Week
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {fb 
                                ? `Submitted on ${new Date(fb.submittedAt).toLocaleDateString()}` 
                                : `Pending evaluation from mentor ${traineeFeedbackDetail.mentor?.name || selectedTraineeForFeedback?.mentorName || ''}`}
                            </span>
                          </div>
                        </div>

                        {fb ? (
                          <Badge variant="active">Completed</Badge>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                            Pending Review
                          </span>
                        )}
                      </div>

                      {/* Submitted Feedback Answers */}
                      {fb && fb.answers ? (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                          {Object.entries(fb.answers).map(([key, val]) => {
                            const isRating = key.toLowerCase().includes('rating');

                            return (
                          <div key={key} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 border-b border-slate-100 py-2 text-xs last:border-0">
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-600 font-semibold capitalize">
                                    {key.replace(/_/g, ' ')}
                                  </span>
                                  {isRating && (
                                  <span className="font-bold text-amber-700 font-mono text-[11px]">
                                      ★ {val} / 5
                                    </span>
                                  )}
                                </div>
                                {!isRating && (
                                  <p className="max-w-3xl text-slate-800 font-medium leading-relaxed">
                                    {String(val)}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic mt-1">
                          No feedback submitted for Week {wNum} yet.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsTraineeFeedbackModalOpen(false);
                  setSelectedTraineeForFeedback(null);
                }}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* TalentNext Courses Modal */}
      <Modal
        isOpen={isTalentNextModalOpen}
        onClose={() => {
          setIsTalentNextModalOpen(false);
          setEditingCourseId(null);
          setSelectedCourseMandatory(false);
        }}
        title={editingCourseId ? 'Edit TalentNext Course' : 'Add TalentNext Course to Cohort'}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {!editingCourseId && (
            <>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-xs text-emerald-900">
                  Select courses from available TalentNext offerings and mark them as mandatory or optional.
                </p>
              </div>

              {/* Create New Course Button */}
              <button
                type="button"
                onClick={() => setIsCreateCourseModalOpen(true)}
                className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create New TalentNext Course</span>
              </button>
            </>
          )}

          {editingCourseId && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <p className="text-xs text-blue-900">
                Editing: <strong>{courseNameMap[editingCourseId]}</strong>
              </p>
            </div>
          )}

          {/* Search */}
          {!editingCourseId && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search courses..."
                value={talentNextSearch}
                onChange={(e) => setTalentNextSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {/* Mandatory/Optional Toggle */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <label className="text-xs font-bold text-slate-700 block mb-2.5">
              Course Type
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="courseMandatory"
                  checked={!selectedCourseMandatory}
                  onChange={() => setSelectedCourseMandatory(false)}
                  className="w-4 h-4"
                />
                <span className="text-xs font-semibold text-slate-700">Optional</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="courseMandatory"
                  checked={selectedCourseMandatory}
                  onChange={() => setSelectedCourseMandatory(true)}
                  className="w-4 h-4"
                />
                <span className="text-xs font-semibold text-slate-700">Mandatory</span>
              </label>
            </div>
          </div>

          {/* Courses List */}
          {!editingCourseId && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
            {talentNextCourses && talentNextCourses.length > 0 ? (
              talentNextCourses
                .filter(c => {
                  // Filter by search term
                  const matchesSearch = c.name.toLowerCase().includes(talentNextSearch.toLowerCase());
                  // Filter out already-assigned courses (unless in edit mode)
                  const isAlreadyAssigned = cohort?.talentnextCourses?.some(a => a.courseId === c.id);
                  return matchesSearch && !isAlreadyAssigned;
                })
                .map(course => (
                  <div
                    key={course.id}
                    onClick={() => {
                      let updated;
                      if (editingCourseId) {
                        // Edit mode: update the existing course assignment
                        updated = cohort?.talentnextCourses?.map(assignment =>
                          assignment.courseId === editingCourseId
                            ? { ...assignment, isMandatory: selectedCourseMandatory }
                            : assignment
                        ) || [];
                      } else {
                        // Add mode: add new course
                        const assignment = {
                          courseId: course.id,
                          isMandatory: selectedCourseMandatory
                        };
                        updated = [...(cohort?.talentnextCourses || []), assignment];
                      }

                      // Call mutation to update cohort
                      updateCohortMutation.mutate(
                        { talentnextCourses: updated },
                        {
                          onSuccess: () => {
                            if (editingCourseId) {
                              showToast(`Updated: ${courseNameMap[editingCourseId]} (${selectedCourseMandatory ? 'Mandatory' : 'Optional'})`);
                            } else {
                              showToast(`Added: ${course.name} (${selectedCourseMandatory ? 'Mandatory' : 'Optional'})`);
                            }
                            setIsTalentNextModalOpen(false);
                            setTalentNextSearch('');
                            setSelectedCourseMandatory(false); // Reset for next time
                            setEditingCourseId(null);
                            queryClient.invalidateQueries({ queryKey: ['cohort', cohortId] });
                          },
                          onError: (err) => {
                            showToast(`Failed to update course: ${err.message}`, 'error');
                          }
                        }
                      );
                    }}
                    className="p-3 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 cursor-pointer hover:bg-emerald-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-800">{course.name}</span>
                      <Plus className="w-4 h-4 text-emerald-600" />
                    </div>
                  </div>
                ))
            ) : talentNextCourses.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No courses available. Create them in the admin panel first.</p>
            ) : (
              <p className="text-xs text-slate-500 text-center py-4">All available courses are already assigned to this cohort.</p>
            )}
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsTalentNextModalOpen(false);
                setEditingCourseId(null);
              }}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Create New TalentNext Course Modal */}
      <Modal
        isOpen={isCreateCourseModalOpen}
        onClose={() => {
          setIsCreateCourseModalOpen(false);
          setNewCourseName('');
        }}
        title="Create New TalentNext Course"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
            <p className="text-xs text-blue-900">
              Create a new TalentNext course that can be assigned to cohorts.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              Course Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Advanced Java Patterns, DevOps Masterclass"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-[11px] text-slate-500">
              Enter a descriptive course name that will be visible to mentors and trainees.
            </p>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsCreateCourseModalOpen(false);
                setNewCourseName('');
              }}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (newCourseName.trim()) {
                  createTalentNextCourseMutation.mutate(newCourseName.trim());
                } else {
                  showToast('Please enter a course name', 'error');
                }
              }}
              disabled={createTalentNextCourseMutation.isPending || !newCourseName.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{createTalentNextCourseMutation.isPending ? 'Creating...' : 'Create Course'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
