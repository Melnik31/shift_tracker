import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 max-w-md w-full text-center">
        <h1 className="text-2xl font-semibold text-slate-800 mb-1">ShiftTracker</h1>
        <p className="text-slate-500 mb-8">Workforce scheduling for any operation.</p>
        <div className="flex flex-col gap-3">
          <Link
            to="/admin/login"
            className="rounded-md bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-700 transition"
          >
            Admin Login
          </Link>
          <Link
            to="/employee/login"
            className="rounded-md border border-slate-300 py-2.5 font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Employee Login
          </Link>
        </div>
        <Link to="/admin/signup" className="block text-sm text-slate-500 mt-6 hover:underline">
          New here? Create a workspace
        </Link>
      </div>
    </div>
  );
}
