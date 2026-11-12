import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import api from '../api/client';
import { cities, timezonesByCountry } from '../data/cities';

const inputClass =
  'w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400';
const labelClass = 'block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1';

/**
 * Nomination form for one mentor or trainee.
 * No cohort is involved: nominees go into a pool that an admin adds to cohorts.
 * `onSubmit(payload)` must return a promise; the form clears itself when it resolves.
 */
export function NomineeForm({ kind, onSubmit, isPending = false }) {
  const isTrainee = kind === 'trainee';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeIdError, setEmployeeIdError] = useState('');
  const [isCheckingEmployeeId, setIsCheckingEmployeeId] = useState(false);
  const [location, setLocation] = useState('');
  const [timezone, setTimezone] = useState('');

  const selectedCity = cities.find(({ city, country }) => location === `${city}, ${country}`);
  const timezoneOptions = selectedCity ? timezonesByCountry[selectedCity.country] : [];

  useEffect(() => {
    const trimmed = employeeId.trim();
    if (!trimmed) {
      setEmployeeIdError('');
      setIsCheckingEmployeeId(false);
      return;
    }

    let cancelled = false;
    setIsCheckingEmployeeId(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/nominations/check-employee-id', {
          params: { employeeId: trimmed },
        });
        if (!cancelled) {
          setEmployeeIdError(
            res.data?.exists
              ? `Employee ID ${trimmed} already exists. Please use a unique Employee ID.`
              : ''
          );
        }
      } catch {
        if (!cancelled) {
          setEmployeeIdError('');
        }
      } finally {
        if (!cancelled) {
          setIsCheckingEmployeeId(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [employeeId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedEmployeeId = employeeId.trim();
    if (!trimmedEmployeeId) {
      setEmployeeIdError('Employee ID is required.');
      return;
    }

    setIsCheckingEmployeeId(true);
    try {
      const checkRes = await api.get('/nominations/check-employee-id', {
        params: { employeeId: trimmedEmployeeId },
      });
      if (checkRes.data?.exists) {
        setEmployeeIdError(
          `Employee ID ${trimmedEmployeeId} already exists. Please use a unique Employee ID.`
        );
        return;
      }
    } catch {
      // Backend POST validation still enforces uniqueness if pre-check fails.
    } finally {
      setIsCheckingEmployeeId(false);
    }

    const payload = {
      name: name.trim(),
      email: email.trim(),
      employeeId: trimmedEmployeeId,
      location: location || null,
      timezone: timezone || null,
    };
    try {
      await onSubmit(payload);
      setName('');
      setEmail('');
      setEmployeeId('');
      setEmployeeIdError('');
      setLocation('');
      setTimezone('');
    } catch (err) {
      const detail = err?.response?.data?.detail || '';
      if (
        err?.response?.status === 409 &&
        detail.toLowerCase().includes('employee id')
      ) {
        setEmployeeIdError(detail);
      }
      // the parent shows the error toast; keep the typed values so nothing is lost
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Full Name</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jordan Scott" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Email</label>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan.scott@example.com" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Employee ID</label>
        <input
          required
          value={employeeId}
          onChange={(e) => {
            setEmployeeId(e.target.value);
            if (employeeIdError) setEmployeeIdError('');
          }}
          placeholder="EMP-305"
          aria-invalid={Boolean(employeeIdError)}
          className={`${inputClass} ${
            employeeIdError ? 'border-rose-400 focus:ring-rose-500' : ''
          }`}
        />
        {employeeIdError && (
          <p className="mt-1 text-xs font-semibold text-rose-600" role="alert">
            {employeeIdError}
          </p>
        )}
      </div>
      <div>
        <label className={labelClass}>Location{isTrainee ? '' : ' (optional)'}</label>
        <select
          required={isTrainee}
          value={location}
          onChange={(e) => {
            const value = e.target.value;
            setLocation(value);
            const match = cities.find(({ city, country }) => value === `${city}, ${country}`);
            setTimezone(match?.timezone || '');
          }}
          className={inputClass}
        >
          <option value="">Select a city</option>
          {['India', 'USA'].map((country) => (
            <optgroup key={country} label={country}>
              {cities.filter((c) => c.country === country).map(({ city }) => (
                <option key={city} value={`${city}, ${country}`}>{city}, {country}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Time Zone{isTrainee ? '' : ' (optional)'}</label>
        <select
          required={isTrainee}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          disabled={!selectedCity}
          className={inputClass}
        >
          <option value="">{selectedCity ? 'Select a time zone' : 'Select a city first'}</option>
          {timezoneOptions.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending || isCheckingEmployeeId || Boolean(employeeIdError)}
        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all"
      >
        <UserPlus className="w-4 h-4" />
        <span>{isPending ? 'Submitting…' : `Submit ${isTrainee ? 'Trainee' : 'Mentor'} Nomination`}</span>
      </button>
    </form>
  );
}
