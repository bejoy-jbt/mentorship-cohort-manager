import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Navigation link returning from cohort-scoped mentor pages to the selected cohort's trainee list.
 */
export function BackToTraineesLink({
  cohortId,
  className = 'mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900',
}) {
  const [searchParams] = useSearchParams();
  const nextParams = new URLSearchParams(searchParams);
  const resolvedCohortId = cohortId || searchParams.get('cohortId');

  if (resolvedCohortId) {
    nextParams.set('cohortId', resolvedCohortId);
  } else {
    nextParams.delete('cohortId');
  }

  const query = nextParams.toString();
  const to = query ? `/mentor/dashboard?${query}` : '/mentor/dashboard';

  return (
    <Link to={to} className={className}>
      <ArrowLeft className="h-4 w-4" /> Back to trainees
    </Link>
  );
}
