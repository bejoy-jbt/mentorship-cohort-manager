import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { BackToTraineesLink } from '../../components/BackToTraineesLink';
import { EmptyState } from '../../components/EmptyState';
import { BookOpen, CalendarDays } from 'lucide-react';

export function MentorPlan() {
  const [params] = useSearchParams();
  const cohortId = params.get('cohortId');
  const { data: plan, isLoading, error } = useQuery({
    queryKey: ['mentorCohortPlan', cohortId],
    queryFn: async () => (await api.get('/mentor/cohort-plan', { params: cohortId ? { cohortId } : {} })).data,
  });

  const { data: talentnextCourses = [] } = useQuery({
    queryKey: ['mentorTalentNextCourses', plan?.cohortId],
    queryFn: async () => {
      if (plan?.talentnextCourses?.length) return plan.talentnextCourses;
      if (!plan?.cohortId) return [];
      const response = await api.get(`/cohorts/${plan.cohortId}`);
      return response.data?.talentnextCourses || [];
    },
    enabled: !!plan?.cohortId,
  });

  const { data: courseDetails = [] } = useQuery({
    queryKey: ['talentnextCourseDetails', talentnextCourses],
    queryFn: async () => {
      if (!talentnextCourses.length) return [];
      const response = await api.get('/talentnext-courses');
      const courseIds = talentnextCourses.map((course) => course.courseId);
      return (response.data || []).filter((course) => courseIds.includes(course.id));
    },
    enabled: talentnextCourses.length > 0,
  });

  if (isLoading) {
    return <main className="mx-auto max-w-6xl px-4 py-8"><div className="h-7 w-56 animate-pulse bg-slate-200" /><div className="mt-6 h-40 animate-pulse bg-slate-100" /></main>;
  }

  if (error || !plan) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No training plan allocated"
        description="The cohort administrator has not applied a training plan yet."
        action={
          <BackToTraineesLink
            cohortId={cohortId}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900"
          />
        }
      />
    );
  }

  const weeks = plan.weeks || [];
  const coreWeeks = plan.coreWeeks ?? weeks.filter((week) => !week.isBuffer && week.courses?.length).length;
  const bufferWeeks = plan.bufferWeeks ?? weeks.filter((week) => week.isBuffer || !week.courses?.length).length;
  const courseCount = weeks.reduce((total, week) => total + (week.courses?.length || 0), 0);
  const totalHours = weeks.reduce((total, week) => total + (week.courses || []).reduce((hours, course) => hours + (course.durationHrs || 0), 0), 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
      <BackToTraineesLink cohortId={cohortId || plan?.cohortId} />

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">{plan.cohortName || 'Cohort curriculum'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{plan.name || 'Allocated Training Plan'}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><CalendarDays className="h-4 w-4" />{plan.cohortDates || 'Training plan'}</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div><span className="text-xs text-slate-500">Duration</span><p className="font-semibold text-slate-900">{plan.totalWeeks || weeks.length} weeks <span className="font-normal text-slate-500">({coreWeeks} core{bufferWeeks ? ` · ${bufferWeeks} buffer` : ''})</span></p></div>
          <div><span className="text-xs text-slate-500">Modules</span><p className="font-semibold text-slate-900">{courseCount}</p></div>
          <div><span className="text-xs text-slate-500">Estimated workload</span><p className="font-semibold text-slate-900">{totalHours} hours</p></div>
        </div>
      </header>

      <section className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
          <h2 className="text-base font-bold text-slate-900">Curriculum by week</h2>
          <p className="text-xs text-slate-500">The cohort curriculum shared with your assigned trainees</p>
        </div>
        <div className="overflow-x-auto border-b border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2.5">Week</th><th className="px-3 py-2.5">Module</th><th className="px-3 py-2.5">Description</th><th className="px-3 py-2.5 text-right">Hours</th></tr>
            </thead>
            {weeks.map((week) => {
              const courses = week.courses?.length ? week.courses : [null];
              const isBuffer = Boolean(week.isBuffer || !week.courses?.length);
              return (
                <tbody key={week.weekNumber} className="divide-y divide-slate-100 border-b border-slate-200">
                  {courses.map((course, index) => (
                    <tr key={`${week.weekNumber}-${course?.courseId || index}`} className={isBuffer ? 'bg-amber-50/50' : 'hover:bg-slate-50/70'}>
                      {index === 0 && (
                        <th rowSpan={courses.length} scope="rowgroup" className="whitespace-nowrap px-3 py-2.5 text-left align-top font-semibold text-slate-800">
                          Week {week.weekNumber}{isBuffer && <span className="ml-2 text-[10px] font-bold uppercase text-amber-700">Buffer</span>}
                        </th>
                      )}
                      <td className="px-3 py-2.5 font-medium text-slate-800">{course?.title || week.title || 'Catch-up and project completion'}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{course?.description || (isBuffer ? 'Time for pending assignments, project work, and mentor review.' : '—')}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{course?.durationHrs ? `${course.durationHrs}h` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
            {!weeks.length && <tbody><tr><td colSpan="4" className="px-3 py-8 text-center text-sm text-slate-500">No curriculum weeks configured.</td></tr></tbody>}
          </table>
        </div>
      </section>

      {talentnextCourses.length > 0 && (
        <section className="mt-7">
          <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
            <h2 className="text-base font-bold text-slate-900">TalentNext courses</h2>
            <p className="text-xs text-slate-500">{talentnextCourses.filter((course) => course.isMandatory).length} required · {talentnextCourses.filter((course) => !course.isMandatory).length} optional</p>
          </div>
          <div className="overflow-x-auto border-b border-slate-200">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5">Course</th><th className="px-3 py-2.5">Requirement</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {talentnextCourses.map((assignment) => (
                  <tr key={assignment.courseId}>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{courseDetails.find((course) => course.id === assignment.courseId)?.name || 'Loading course…'}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-slate-600">{assignment.isMandatory ? 'Required' : 'Optional'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
