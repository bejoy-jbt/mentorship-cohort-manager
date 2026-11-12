import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Clock, X } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

/**
 * Shared selector & inline creator for TalentNext courses.
 * Used in Training Template Builder and Create New Cohort without nesting <form> tags.
 */
export function TalentNextCourseSelector({
  catalog = [],
  assignments = [],
  onChange,
  subtitle = 'Selected courses are included when this training plan is applied to a cohort.',
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [courseUrl, setCourseUrl] = useState('');
  const [durationHrs, setDurationHrs] = useState('');
  const [formError, setFormError] = useState('');

  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const resetForm = () => {
    setCourseName('');
    setCourseDescription('');
    setCourseUrl('');
    setDurationHrs('');
    setFormError('');
    setIsAdding(false);
  };

  const createCourseMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/talentnext-courses', payload);
      return res.data;
    },
    onSuccess: (created) => {
      queryClient.setQueryData(['talentnextCoursesList'], (old = []) => [
        created,
        ...old.filter((c) => c.id !== created.id),
      ]);
      queryClient.invalidateQueries({ queryKey: ['talentnextCoursesList'] });
      queryClient.invalidateQueries({ queryKey: ['allTalentNextCoursesForMapping'] });

      if (!assignments.some((item) => item.courseId === created.id)) {
        onChange([...assignments, { courseId: created.id, isMandatory: true }]);
      }
      showToast(`Course "${created.name}" added to TalentNext catalog`);
      resetForm();
    },
    onError: (err) => {
      const message = err.response?.data?.detail || 'Failed to add TalentNext course';
      setFormError(message);
      showToast(message, 'error');
    },
  });

  const handleSaveCourse = () => {
    const trimmedName = courseName.trim();
    if (!trimmedName) {
      setFormError('Course name is required.');
      return;
    }

    const duplicate = catalog.find(
      (c) => (c.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setFormError(`TalentNext course "${duplicate.name}" already exists.`);
      return;
    }

    let parsedDuration = null;
    if (durationHrs !== '' && durationHrs !== null) {
      const num = Number(durationHrs);
      if (Number.isNaN(num) || num < 0) {
        setFormError('Duration in hours must be a non-negative number.');
        return;
      }
      parsedDuration = num;
    }

    setFormError('');
    createCourseMutation.mutate({
      name: trimmedName,
      description: courseDescription.trim(),
      courseUrl: courseUrl.trim(),
      durationHrs: parsedDuration,
    });
  };

  return (
    <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            TalentNext Courses
          </h3>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setIsAdding(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800 shadow-xs hover:bg-amber-50 transition-colors"
          >
            + Add TalentNext Course
          </button>
        )}
      </div>

      {isAdding && (
        <div
          className="space-y-3 rounded-xl border border-amber-200 bg-white p-3.5 shadow-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
              handleSaveCourse();
            }
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800">New TalentNext Course</span>
            <button
              type="button"
              onClick={resetForm}
              aria-label="Close new course form"
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Course Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={courseName}
                onChange={(e) => {
                  setCourseName(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder="e.g. Docker & Container Security"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Course Description <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={courseDescription}
                onChange={(e) => setCourseDescription(e.target.value)}
                placeholder="Brief summary of modules or outcomes..."
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Course URL <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="url"
                value={courseUrl}
                onChange={(e) => setCourseUrl(e.target.value)}
                placeholder="https://talentnext.example.com/..."
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Duration in Hours <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={durationHrs}
                onChange={(e) => setDurationHrs(e.target.value)}
                placeholder="e.g. 6"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {formError && (
            <p className="text-xs font-semibold text-rose-600" role="alert">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCourse}
              disabled={createCourseMutation.isPending}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createCourseMutation.isPending ? 'Saving...' : 'Save Course'}
            </button>
          </div>
        </div>
      )}

      {catalog.length ? (
        <div className="max-h-56 divide-y divide-amber-100 overflow-y-auto rounded-lg border border-amber-100 bg-white">
          {catalog.map((course) => {
            const assignment = assignments.find((item) => item.courseId === course.id);
            return (
              <div key={course.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <label className="flex min-w-0 flex-1 items-start gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(assignment)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...assignments, { courseId: course.id, isMandatory: true }]
                        : assignments.filter((item) => item.courseId !== course.id);
                      onChange(next);
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">{course.name}</span>
                      {course.durationHrs != null && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          <Clock className="h-2.5 w-2.5" />
                          {course.durationHrs}h
                        </span>
                      )}
                      {course.courseUrl && (
                        <a
                          href={course.courseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          Link
                        </a>
                      )}
                    </span>
                    {course.description && (
                      <span className="mt-0.5 block text-[11px] font-normal text-slate-500 line-clamp-1">
                        {course.description}
                      </span>
                    )}
                  </span>
                </label>
                {assignment && (
                  <select
                    aria-label={`${course.name} requirement`}
                    value={assignment.isMandatory ? 'required' : 'optional'}
                    onChange={(event) =>
                      onChange(
                        assignments.map((item) =>
                          item.courseId === course.id
                            ? { ...item, isMandatory: event.target.value === 'required' }
                            : item
                        )
                      )
                    }
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
                  >
                    <option value="required">Required</option>
                    <option value="optional">Optional</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-amber-200 bg-white px-3 py-4 text-center text-xs text-slate-500">
          No TalentNext courses are available yet. Click &ldquo;+ Add TalentNext Course&rdquo; to create one.
        </p>
      )}
    </section>
  );
}
