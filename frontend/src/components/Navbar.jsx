import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Badge } from './Badge';
import { GraduationCap, LogOut } from 'lucide-react';

export function Navbar() {
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo / Title */}
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-slate-800 block">
                  Cohort<span className="text-emerald-600">Manager</span>
                </span>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block -mt-0.5">
                  Mentorship Hub
                </span>
              </div>
            </Link>

            {/* Nav Links based on Role */}
            <nav className={`${role === 'mentor' ? 'flex' : 'hidden md:flex'} items-center gap-1`}>
              {role === 'admin' && (
                <>
                  <Link
                    to="/admin/cohorts"
                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                      isActive('/admin/cohorts')
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Cohorts
                  </Link>
                  <Link
                    to="/admin/nominations"
                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                      isActive('/admin/nominations')
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Nominations
                  </Link>
                  <Link
                    to="/admin/training-templates"
                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                      isActive('/admin/training-templates')
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Training Plans
                  </Link>
                  <Link
                    to="/admin/feedback-templates"
                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                      isActive('/admin/feedback-templates')
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Feedback Forms
                  </Link>
                  <Link
                    to="/admin/reports"
                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                      isActive('/admin/reports')
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Reports
                  </Link>
                </>
              )}

              {role === 'mentor' && (
                <>
                  <Link
                    to="/mentor/dashboard"
                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                      isActive('/mentor')
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    My Cohorts
                  </Link>
                </>
              )}

              {role === 'nominator' && (
                <Link
                  to="/nominator/dashboard"
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                    isActive('/nominator/dashboard')
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Nominations
                </Link>
              )}
            </nav>
          </div>

          {/* User Profile & Logout */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-800 leading-tight">
                  {user?.name || 'User'}
                </div>
                <div className="text-[11px] text-slate-500">{user?.email}</div>
              </div>
              <Badge variant={role} size="sm">
                {role}
              </Badge>
            </div>

            <button
              onClick={logout}
              title="Sign out"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
